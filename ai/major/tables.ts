/**
 * THE MAJORS' AI TABLES, written by tools/install/ai_tables.py from the
 * layered install (`--check` reports a stale file). Policies and governments
 * run in DATABASE ORDER, the index the game's AI loops walk.
 */
import type {
  AiBelief, AiFeature, AiGovernment, AiGovernor, AiGovernorPromotion, AiPlotEvalItem, AiPolicy, AiReligion, AiSlotType, AiStrategy,
  AiStrategyBias,
} from './types';

export const AI_POLICIES: readonly AiPolicy[] = [
 {
  "type": "POLICY_DISCIPLINE",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_CODE_OF_LAWS",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_NATIVE_CONQUEST",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "DISCIPLINE_BARBARIANCOMBAT",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_ADJUST_UNIT_BARBARIAN_COMBAT",
    "args": {
     "Amount": "5"
    }
   }
  ]
 },
 {
  "type": "POLICY_SURVEY",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_CODE_OF_LAWS",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_NATIVE_CONQUEST",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "SURVEY_RECONUNITEXPERIENCE",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_ADJUST_UNIT_EXPERIENCE_MODIFIER",
    "args": {
     "Amount": "100"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_UNIT_PROMOTION_CLASS_MATCHES",
       "inverse": false,
       "args": {
        "UnitPromotionClass": "PROMOTION_CLASS_RECON"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "POLICY_GOD_KING",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_CODE_OF_LAWS",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_SCRIPTURE",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "GOD_KING_GOLD",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "1"
    }
   },
   {
    "id": "GOD_KING_FAITH",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "POLICY_URBAN_PLANNING",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_CODE_OF_LAWS",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_RATIONALISM",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "URBAN_PLANNING_ALLCITYPRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "POLICY_ILKUM",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_CRAFTSMANSHIP",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_SERFDOM",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "ILKUM_BUILDERPRODUCTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_UNIT_PRODUCTION",
    "args": {
     "UnitType": "UNIT_BUILDER",
     "Amount": "30"
    }
   }
  ]
 },
 {
  "type": "POLICY_AGOGE",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_CRAFTSMANSHIP",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_FEUDAL_CONTRACT",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "AGOGE_ANCIENT_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_MELEE",
     "EraType": "ERA_ANCIENT",
     "Amount": "50"
    }
   },
   {
    "id": "AGOGE_CLASSICAL_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_MELEE",
     "EraType": "ERA_CLASSICAL",
     "Amount": "50"
    }
   },
   {
    "id": "AGOGE_ANCIENT_ANTI_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY",
     "EraType": "ERA_ANCIENT",
     "Amount": "50"
    }
   },
   {
    "id": "AGOGE_CLASSICAL_ANTI_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY",
     "EraType": "ERA_CLASSICAL",
     "Amount": "50"
    }
   },
   {
    "id": "AGOGE_ANCIENT_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_RANGED",
     "EraType": "ERA_ANCIENT",
     "Amount": "50"
    }
   },
   {
    "id": "AGOGE_CLASSICAL_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_RANGED",
     "EraType": "ERA_CLASSICAL",
     "Amount": "50"
    }
   }
  ]
 },
 {
  "type": "POLICY_CARAVANSARIES",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_FOREIGN_TRADE",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_TRIANGULAR_TRADE",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "CARAVANSARIES_TRADEROUTEGOLD",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_TRADE_ROUTE_YIELD",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "2"
    }
   }
  ]
 },
 {
  "type": "POLICY_MARITIME_INDUSTRIES",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_FOREIGN_TRADE",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_PRESS_GANGS",
    "gpClass": null
   },
   {
    "policy": "POLICY_INTERNATIONAL_WATERS",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "MARITIMIEINDUSTRIES_ANCIENT_NAVAL_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_MELEE",
     "EraType": "ERA_ANCIENT",
     "Amount": "100"
    }
   },
   {
    "id": "MARITIMIEINDUSTRIES_CLASSICAL_NAVAL_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_MELEE",
     "EraType": "ERA_CLASSICAL",
     "Amount": "100"
    }
   },
   {
    "id": "MARITIMIEINDUSTRIES_ANCIENT_NAVAL_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RANGED",
     "EraType": "ERA_ANCIENT",
     "Amount": "100"
    }
   },
   {
    "id": "MARITIMIEINDUSTRIES_CLASSICAL_NAVAL_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RANGED",
     "EraType": "ERA_CLASSICAL",
     "Amount": "100"
    }
   },
   {
    "id": "MARITIMIEINDUSTRIES_ANCIENT_NAVAL_RAIDER_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RAIDER",
     "EraType": "ERA_ANCIENT",
     "Amount": "100"
    }
   },
   {
    "id": "MARITIMIEINDUSTRIES_CLASSICAL_NAVAL_RAIDER_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RAIDER",
     "EraType": "ERA_CLASSICAL",
     "Amount": "100"
    }
   }
  ]
 },
 {
  "type": "POLICY_MANEUVER",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_MILITARY_TRADITION",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_CHIVALRY",
    "gpClass": null
   },
   {
    "policy": "POLICY_LIGHTNING_WARFARE",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "MANEUVER_ANCIENT_HEAVY_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_HEAVY_CAVALRY",
     "EraType": "ERA_ANCIENT",
     "Amount": "50"
    }
   },
   {
    "id": "MANEUVER_CLASSICAL_HEAVY_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_HEAVY_CAVALRY",
     "EraType": "ERA_CLASSICAL",
     "Amount": "50"
    }
   },
   {
    "id": "MANEUVER_ANCIENT_LIGHT_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_LIGHT_CAVALRY",
     "EraType": "ERA_ANCIENT",
     "Amount": "50"
    }
   },
   {
    "id": "MANEUVER_CLASSICAL_LIGHT_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_LIGHT_CAVALRY",
     "EraType": "ERA_CLASSICAL",
     "Amount": "50"
    }
   }
  ]
 },
 {
  "type": "POLICY_STRATEGOS",
  "slot": "SLOT_GREAT_PERSON",
  "civic": "CIVIC_MILITARY_TRADITION",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_MILITARY_ORGANIZATION",
    "gpClass": "GREAT_PERSON_CLASS_GENERAL"
   }
  ],
  "modifiers": [
   {
    "id": "STRATEGOS_GREATGENERALPOINTS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_GENERAL",
     "Amount": "2"
    }
   }
  ]
 },
 {
  "type": "POLICY_CORVEE",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_STATE_WORKFORCE",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_GOTHIC_ARCHITECTURE",
    "gpClass": null
   },
   {
    "policy": "POLICY_SKYSCRAPERS",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "CORVEE_ANCIENTCLASSICALWONDER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_WONDER_ERA_PRODUCTION",
    "args": {
     "Amount": "15",
     "IsWonder": "true",
     "StartEra": "ERA_ANCIENT",
     "EndEra": "ERA_CLASSICAL"
    }
   }
  ]
 },
 {
  "type": "POLICY_CONSCRIPTION",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_STATE_WORKFORCE",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_LEVEE_EN_MASSE",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "CONSCRIPTION_UNITMAINTENANCEDISCOUNT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_UNIT_MAINTENANCE_DISCOUNT",
    "args": {
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "POLICY_LAND_SURVEYORS",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_EARLY_EMPIRE",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_EXPROPRIATION",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "LANDSURVEYORS_PLOTPURCHASECOST",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_PLOT_PURCHASE_COST",
    "args": {
     "Amount": "-20"
    }
   }
  ]
 },
 {
  "type": "POLICY_COLONIZATION",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_EARLY_EMPIRE",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_EXPROPRIATION",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "COLONIZATION_SETTLERPRODUCTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_UNIT_PRODUCTION",
    "args": {
     "UnitType": "UNIT_SETTLER",
     "Amount": "50"
    }
   }
  ]
 },
 {
  "type": "POLICY_INSPIRATION",
  "slot": "SLOT_GREAT_PERSON",
  "civic": "CIVIC_MYSTICISM",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_NOBEL_PRIZE",
    "gpClass": "GREAT_PERSON_CLASS_SCIENTIST"
   }
  ],
  "modifiers": [
   {
    "id": "INSPIRATION_GREATSCIENTISTPOINTS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_SCIENTIST",
     "Amount": "2"
    }
   }
  ]
 },
 {
  "type": "POLICY_REVELATION",
  "slot": "SLOT_GREAT_PERSON",
  "civic": "CIVIC_MYSTICISM",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_INVENTION",
    "gpClass": "GREAT_PERSON_CLASS_PROPHET"
   }
  ],
  "modifiers": [
   {
    "id": "REVELATION_GREATPROPHETPOINTS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_PROPHET",
     "Amount": "2"
    }
   }
  ]
 },
 {
  "type": "POLICY_INSULAE",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_GAMES_RECREATION",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_MEDINA_QUARTER",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "INSULAE_SPECIALTYHOUSING",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_POLICY_HOUSING",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_X_SPECIALTY_DISTRICTS",
       "inverse": false,
       "args": {
        "Amount": "2"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "POLICY_CHARISMATIC_LEADER",
  "slot": "SLOT_DIPLOMATIC",
  "civic": "CIVIC_POLITICAL_PHILOSOPHY",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_GUNBOAT_DIPLOMACY",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "CHARISMATICLEADER_INFLUENCEPOINTS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_INFLUENCE_POINTS_PER_TURN",
    "args": {
     "Amount": "2"
    }
   }
  ]
 },
 {
  "type": "POLICY_DIPLOMATIC_LEAGUE",
  "slot": "SLOT_DIPLOMATIC",
  "civic": "CIVIC_POLITICAL_PHILOSOPHY",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "DIPLOMATICLEAGUE_DUPLICATEFIRSTINFLUENCETOKEN",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_DUPLICATE_FIRST_INFLUENCE_TOKEN",
    "args": {
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "POLICY_LITERARY_TRADITION",
  "slot": "SLOT_GREAT_PERSON",
  "civic": "CIVIC_DRAMA_POETRY",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": null,
    "gpClass": "GREAT_PERSON_CLASS_WRITER"
   }
  ],
  "modifiers": [
   {
    "id": "LITERARYTRADITION_GREATWRITERPOINTS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_WRITER",
     "Amount": "2"
    }
   }
  ]
 },
 {
  "type": "POLICY_RAID",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_MILITARY_TRAINING",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_TOTAL_WAR",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "RAID_DOUBLEPILLAGEIMPROVE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_UNIT_PILLAGE_IMPROVEMENT_MODIFIER",
    "args": {
     "Amount": "50"
    }
   },
   {
    "id": "SACK_DOUBLEPILLAGEDISTRICT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_UNIT_PILLAGE_DISTRICT_MODIFIER",
    "args": {
     "Amount": "50"
    }
   }
  ]
 },
 {
  "type": "POLICY_VETERANCY",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_MILITARY_TRAINING",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "VETERANCY_ENCAMPMENT_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_DISTRICT_PRODUCTION",
    "args": {
     "DistrictType": "DISTRICT_ENCAMPMENT",
     "Amount": "30"
    }
   },
   {
    "id": "VETERANCY_ENCAMPMENT_BUILDINGS_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_PRODUCTION",
    "args": {
     "DistrictType": "DISTRICT_ENCAMPMENT",
     "Amount": "30"
    }
   },
   {
    "id": "VETERANCY_HARBOR_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_DISTRICT_PRODUCTION",
    "args": {
     "DistrictType": "DISTRICT_HARBOR",
     "Amount": "30"
    }
   },
   {
    "id": "VETERANCY_HARBOR_BUILDINGS_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_PRODUCTION",
    "args": {
     "DistrictType": "DISTRICT_HARBOR",
     "Amount": "30"
    }
   }
  ]
 },
 {
  "type": "POLICY_BASTIONS",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_DEFENSIVE_TACTICS",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_PUBLIC_WORKS",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "BASTIONS_OUTERDEFENSE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_OUTER_DEFENSE",
    "args": {
     "Amount": "6"
    }
   },
   {
    "id": "BASTIONS_RANGEDSTRIKE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_RANGED_STRIKE",
    "args": {
     "Amount": "5"
    }
   }
  ]
 },
 {
  "type": "POLICY_LIMES",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_DEFENSIVE_TACTICS",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_LIGHTNING_WARFARE",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "LIMES_CASTLEPRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_PRODUCTION",
    "args": {
     "BuildingType": "BUILDING_CASTLE",
     "Amount": "100"
    }
   },
   {
    "id": "LIMES_WALLSPRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_PRODUCTION",
    "args": {
     "BuildingType": "BUILDING_WALLS",
     "Amount": "100"
    }
   },
   {
    "id": "LIMES_STARFORTPRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_PRODUCTION",
    "args": {
     "BuildingType": "BUILDING_STAR_FORT",
     "Amount": "100"
    }
   },
   {
    "id": "LIMES_TSIKHEPRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_PRODUCTION",
    "args": {
     "BuildingType": "BUILDING_TSIKHE",
     "Amount": "100"
    }
   }
  ]
 },
 {
  "type": "POLICY_NATURAL_PHILOSOPHY",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_RECORDED_HISTORY",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_FIVE_YEAR_PLAN",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "NATURALPHILOSOPHY_DISTRICTSCIENCE",
    "collection": "COLLECTION_PLAYER_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "100"
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
   }
  ]
 },
 {
  "type": "POLICY_SCRIPTURE",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_THEOLOGY",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "SCRIPTURE_DISTRICTFAITH",
    "collection": "COLLECTION_PLAYER_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_FAITH",
     "Amount": "100"
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
   }
  ]
 },
 {
  "type": "POLICY_NAVAL_INFRASTRUCTURE",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_NAVAL_TRADITION",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_ECONOMIC_UNION",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "NAVALINFRASTRUCTURE_HARBORGOLD",
    "collection": "COLLECTION_PLAYER_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "100"
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
   }
  ]
 },
 {
  "type": "POLICY_NAVIGATION",
  "slot": "SLOT_GREAT_PERSON",
  "civic": "CIVIC_NAVAL_TRADITION",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": null,
    "gpClass": "GREAT_PERSON_CLASS_ADMIRAL"
   }
  ],
  "modifiers": [
   {
    "id": "NAVIGATION_GREATADMIRALPOINTS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_ADMIRAL",
     "Amount": "2"
    }
   }
  ]
 },
 {
  "type": "POLICY_FEUDAL_CONTRACT",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_FEUDALISM",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_GRANDE_ARMEE",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "AGOGE_ANCIENT_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_MELEE",
     "EraType": "ERA_ANCIENT",
     "Amount": "50"
    }
   },
   {
    "id": "AGOGE_CLASSICAL_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_MELEE",
     "EraType": "ERA_CLASSICAL",
     "Amount": "50"
    }
   },
   {
    "id": "AGOGE_ANCIENT_ANTI_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY",
     "EraType": "ERA_ANCIENT",
     "Amount": "50"
    }
   },
   {
    "id": "AGOGE_CLASSICAL_ANTI_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY",
     "EraType": "ERA_CLASSICAL",
     "Amount": "50"
    }
   },
   {
    "id": "AGOGE_ANCIENT_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_RANGED",
     "EraType": "ERA_ANCIENT",
     "Amount": "50"
    }
   },
   {
    "id": "FEUDALCONTRACT_MEDIEVAL_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_MELEE",
     "EraType": "ERA_MEDIEVAL",
     "Amount": "50"
    }
   },
   {
    "id": "FEUDALCONTRACT_RENAISSANCE_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_MELEE",
     "EraType": "ERA_RENAISSANCE",
     "Amount": "50"
    }
   },
   {
    "id": "FEUDALCONTRACT_MEDIEVAL_ANTI_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY",
     "EraType": "ERA_MEDIEVAL",
     "Amount": "50"
    }
   },
   {
    "id": "FEUDALCONTRACT_RENAISSANCE_ANTI_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY",
     "EraType": "ERA_RENAISSANCE",
     "Amount": "50"
    }
   },
   {
    "id": "FEUDALCONTRACT_MEDIEVAL_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_RANGED",
     "EraType": "ERA_MEDIEVAL",
     "Amount": "50"
    }
   },
   {
    "id": "FEUDALCONTRACT_RENAISSANCE_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_RANGED",
     "EraType": "ERA_RENAISSANCE",
     "Amount": "50"
    }
   }
  ]
 },
 {
  "type": "POLICY_SERFDOM",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_FEUDALISM",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_PUBLIC_WORKS",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "SERFDOM_BUILDERCHARGES",
    "collection": "COLLECTION_PLAYER_TRAINED_UNITS",
    "effect": "EFFECT_ADJUST_UNIT_BUILD_CHARGES",
    "args": {
     "Amount": "2"
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
   }
  ]
 },
 {
  "type": "POLICY_RETAINERS",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_CIVIL_SERVICE",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_PROPAGANDA",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "RETAINERS_AMENITYBONUS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_POLICY_AMENITY",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_GARRISON_UNIT",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "POLICY_PROFESSIONAL_ARMY",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_MERCENARIES",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_FORCE_MODERNIZATION",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "PROFESSIONAL_ARMY_UNITUPGRADEDISCOUNT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_UNIT_UPGRADE_DISCOUNT_PERCENT",
    "args": {
     "Amount": "50"
    }
   }
  ]
 },
 {
  "type": "POLICY_TRADE_CONFEDERATION",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_MERCENARIES",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_MARKET_ECONOMY",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "TRADECONFEDERATION_TRADEROUTECULTURE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_TRADE_ROUTE_YIELD_FOR_INTERNATIONAL",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "Amount": "1"
    }
   },
   {
    "id": "TRADECONFEDERATION_TRADEROUTESCIENCE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_TRADE_ROUTE_YIELD_FOR_INTERNATIONAL",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "POLICY_MERCHANT_CONFEDERATION",
  "slot": "SLOT_DIPLOMATIC",
  "civic": "CIVIC_MEDIEVAL_FAIRES",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "MERCHANTCONFEDERATION_INFLUENCETOKENGOLD",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_YIELD_CHANGE_PER_USED_INFLUENCE_TOKEN",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "POLICY_AESTHETICS",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_MEDIEVAL_FAIRES",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_SPORTS_MEDIA",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "AESTHETICS_DISTRICTCULTURE",
    "collection": "COLLECTION_PLAYER_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "Amount": "100"
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
   }
  ]
 },
 {
  "type": "POLICY_MEDINA_QUARTER",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_MEDIEVAL_FAIRES",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_NEW_DEAL",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "MEDINAQUARTER_SPECIALTYHOUSING",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_POLICY_HOUSING",
    "args": {
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_X_SPECIALTY_DISTRICTS",
       "inverse": false,
       "args": {
        "Amount": "3"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "POLICY_CRAFTSMEN",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_GUILDS",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_FIVE_YEAR_PLAN",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "CRAFTSMEN_DISTRICTPRODUCTION",
    "collection": "COLLECTION_PLAYER_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "100"
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
   }
  ]
 },
 {
  "type": "POLICY_TOWN_CHARTERS",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_GUILDS",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_ECONOMIC_UNION",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "TOWNCHARTERS_DISTRICTGOLD",
    "collection": "COLLECTION_PLAYER_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "100"
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
   }
  ]
 },
 {
  "type": "POLICY_TRAVELING_MERCHANTS",
  "slot": "SLOT_GREAT_PERSON",
  "civic": "CIVIC_GUILDS",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_LAISSEZ_FAIRE",
    "gpClass": "GREAT_PERSON_CLASS_MERCHANT"
   }
  ],
  "modifiers": [
   {
    "id": "TRAVELINGMERCHANTS_GREATMERCHANTPOINTS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_MERCHANT",
     "Amount": "2"
    }
   }
  ]
 },
 {
  "type": "POLICY_CHIVALRY",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_DIVINE_RIGHT",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_LIGHTNING_WARFARE",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "CHIVALRY_MEDIEVAL_HEAVY_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_HEAVY_CAVALRY",
     "EraType": "ERA_MEDIEVAL",
     "Amount": "50"
    }
   },
   {
    "id": "CHIVALRY_RENAISSANCE_HEAVY_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_HEAVY_CAVALRY",
     "EraType": "ERA_RENAISSANCE",
     "Amount": "50"
    }
   },
   {
    "id": "CHIVALRY_INDUSTRIAL_HEAVY_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_HEAVY_CAVALRY",
     "EraType": "ERA_INDUSTRIAL",
     "Amount": "50"
    }
   },
   {
    "id": "CHIVALRY_MEDIEVAL_LIGHT_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_LIGHT_CAVALRY",
     "EraType": "ERA_MEDIEVAL",
     "Amount": "50"
    }
   },
   {
    "id": "CHIVALRY_RENAISSANCE_LIGHT_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_LIGHT_CAVALRY",
     "EraType": "ERA_RENAISSANCE",
     "Amount": "50"
    }
   },
   {
    "id": "CHIVALRY_INDUSTRIAL_LIGHT_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_LIGHT_CAVALRY",
     "EraType": "ERA_INDUSTRIAL",
     "Amount": "50"
    }
   },
   {
    "id": "MANEUVER_ANCIENT_HEAVY_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_HEAVY_CAVALRY",
     "EraType": "ERA_ANCIENT",
     "Amount": "50"
    }
   },
   {
    "id": "MANEUVER_CLASSICAL_HEAVY_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_HEAVY_CAVALRY",
     "EraType": "ERA_CLASSICAL",
     "Amount": "50"
    }
   },
   {
    "id": "MANEUVER_ANCIENT_LIGHT_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_LIGHT_CAVALRY",
     "EraType": "ERA_ANCIENT",
     "Amount": "50"
    }
   },
   {
    "id": "MANEUVER_CLASSICAL_LIGHT_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_LIGHT_CAVALRY",
     "EraType": "ERA_CLASSICAL",
     "Amount": "50"
    }
   }
  ]
 },
 {
  "type": "POLICY_GOTHIC_ARCHITECTURE",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_DIVINE_RIGHT",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_SKYSCRAPERS",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "GOTHICARCHITECTURE_MEDIEVALRENAISSANCEWONDER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_WONDER_ERA_PRODUCTION",
    "args": {
     "Amount": "15",
     "IsWonder": "true",
     "StartEra": "ERA_ANCIENT",
     "EndEra": "ERA_RENAISSANCE"
    }
   }
  ]
 },
 {
  "type": "POLICY_PRESS_GANGS",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_EXPLORATION",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_INTERNATIONAL_WATERS",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "PRESSGANGS_RENAISSANCE_NAVAL_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_MELEE",
     "EraType": "ERA_RENAISSANCE",
     "Amount": "100"
    }
   },
   {
    "id": "PRESSGANGS_INDUSTRIAL_NAVAL_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_MELEE",
     "EraType": "ERA_INDUSTRIAL",
     "Amount": "100"
    }
   },
   {
    "id": "PRESSGANGS_RENAISSANCE_NAVAL_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RANGED",
     "EraType": "ERA_RENAISSANCE",
     "Amount": "100"
    }
   },
   {
    "id": "PRESSGANGS_INDUSTRIAL_NAVAL_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RANGED",
     "EraType": "ERA_INDUSTRIAL",
     "Amount": "100"
    }
   },
   {
    "id": "PRESSGANGS_RENAISSANCE_NAVAL_RAIDER_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RAIDER",
     "EraType": "ERA_RENAISSANCE",
     "Amount": "100"
    }
   },
   {
    "id": "PRESSGANGS_INDUSTRIAL_NAVAL_RAIDER_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RAIDER",
     "EraType": "ERA_INDUSTRIAL",
     "Amount": "100"
    }
   },
   {
    "id": "MARITIMIEINDUSTRIES_ANCIENT_NAVAL_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_MELEE",
     "EraType": "ERA_ANCIENT",
     "Amount": "100"
    }
   },
   {
    "id": "MARITIMIEINDUSTRIES_CLASSICAL_NAVAL_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_MELEE",
     "EraType": "ERA_CLASSICAL",
     "Amount": "100"
    }
   },
   {
    "id": "MARITIMIEINDUSTRIES_ANCIENT_NAVAL_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RANGED",
     "EraType": "ERA_ANCIENT",
     "Amount": "100"
    }
   },
   {
    "id": "MARITIMIEINDUSTRIES_CLASSICAL_NAVAL_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RANGED",
     "EraType": "ERA_CLASSICAL",
     "Amount": "100"
    }
   },
   {
    "id": "MARITIMIEINDUSTRIES_ANCIENT_NAVAL_RAIDER_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RAIDER",
     "EraType": "ERA_ANCIENT",
     "Amount": "100"
    }
   },
   {
    "id": "MARITIMIEINDUSTRIES_CLASSICAL_NAVAL_RAIDER_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RAIDER",
     "EraType": "ERA_CLASSICAL",
     "Amount": "100"
    }
   },
   {
    "id": "PRESSGANGS_MEDIEVAL_NAVAL_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_MELEE",
     "EraType": "ERA_MEDIEVAL",
     "Amount": "100"
    }
   },
   {
    "id": "PRESSGANGS_MEDIEVAL_NAVAL_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RANGED",
     "EraType": "ERA_MEDIEVAL",
     "Amount": "100"
    }
   },
   {
    "id": "PRESSGANGS_MEDIEVAL_NAVAL_RAIDER_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RAIDER",
     "EraType": "ERA_MEDIEVAL",
     "Amount": "100"
    }
   }
  ]
 },
 {
  "type": "POLICY_COLONIAL_OFFICES",
  "slot": "SLOT_DIPLOMATIC",
  "civic": "CIVIC_EXPLORATION",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "COLONIALOFFICES_FOREIGNGROWTH",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_GROWTH",
    "args": {
     "Amount": "15"
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
   },
   {
    "id": "COLONIALOFFICES_FOREIGNIDENTITY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_IDENTITY_PER_TURN",
    "args": {
     "Amount": "3"
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
 },
 {
  "type": "POLICY_INVENTION",
  "slot": "SLOT_GREAT_PERSON",
  "civic": "CIVIC_HUMANISM",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": null,
    "gpClass": "GREAT_PERSON_CLASS_ENGINEER"
   }
  ],
  "modifiers": [
   {
    "id": "INVENTION_ENGINEER_WORKSHOP",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_ENGINEER",
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_WORKSHOP"
       }
      }
     ]
    }
   },
   {
    "id": "INVENTION_GREATENGINEERPOINTS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_ENGINEER",
     "Amount": "4"
    }
   }
  ]
 },
 {
  "type": "POLICY_FRESCOES",
  "slot": "SLOT_GREAT_PERSON",
  "civic": "CIVIC_HUMANISM",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": null,
    "gpClass": "GREAT_PERSON_CLASS_ARTIST"
   }
  ],
  "modifiers": [
   {
    "id": "FRESCOES_GREATARTISTPOINTS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_ARTIST",
     "Amount": "2"
    }
   },
   {
    "id": "FRESCOES_ARTIST_ARTMUSEUM",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_ARTIST",
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_MUSEUM_ART"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "POLICY_MACHIAVELLIANISM",
  "slot": "SLOT_DIPLOMATIC",
  "civic": "CIVIC_DIPLOMATIC_SERVICE",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "MACHIAVELLIANISM_SPYPRODUCTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_UNIT_PRODUCTION",
    "args": {
     "UnitType": "UNIT_SPY",
     "Amount": "50"
    }
   },
   {
    "id": "MACHIAVELLIANISM_OFFENSIVESPYTIME",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_ADJUST_UNIT_SPY_OFFENSIVE_OPERATION_TIME",
    "args": {
     "ReductionPercent": "25"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_UNIT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "UnitType": "UNIT_SPY"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "POLICY_WARS_OF_RELIGION",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_REFORMED_CHURCH",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "WARS_OF_RELIGION_COMBAT",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "WARS_OF_RELIGION_COMBAT_MODIFIER"
    },
    "attach": {
     "id": "WARS_OF_RELIGION_COMBAT_MODIFIER",
     "collection": "COLLECTION_UNIT_COMBAT",
     "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
     "args": {
      "Amount": "4"
     },
     "subjectReqs": {
      "test": "ALL",
      "reqs": [
       {
        "type": "REQUIREMENT_OPPONENT_IS_OTHER_RELIGION",
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
       "type": "REQUIREMENT_UNIT_TAG_MATCHES",
       "inverse": true,
       "args": {
        "Tag": "CLASS_RELIGIOUS"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "POLICY_RELIGIOUS_ORDERS",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_REFORMED_CHURCH",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "RELIGIOUSORDERS_COMBAT_BUFF",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_RELIGIOUS_ORDERS_BUFF"
    },
    "ability": [
     {
      "id": "RELIGIOUS_ORDERS_BUFF",
      "collection": "COLLECTION_UNIT_COMBAT",
      "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
      "args": {
       "Amount": "5"
      }
     }
    ]
   }
  ]
 },
 {
  "type": "POLICY_SIMULTANEUM",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_REFORMED_CHURCH",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "SIMULTANEUM_BUILDING_YIELDS_HIGH_ADJACENCY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_MODIFIERS_FOR_DISTRICT",
    "args": {
     "DistrictType": "DISTRICT_HOLY_SITE",
     "YieldType": "YIELD_FAITH",
     "Amount": "50"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_HIGH_ADJACENCY_DISTRICT",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_HOLY_SITE",
        "YieldType": "YIELD_FAITH",
        "Amount": "4"
       }
      }
     ]
    }
   },
   {
    "id": "SIMULTANEUM_BUILDING_YIELDS_HIGH_POP",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_MODIFIERS_FOR_DISTRICT",
    "args": {
     "DistrictType": "DISTRICT_HOLY_SITE",
     "YieldType": "YIELD_FAITH",
     "Amount": "50"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_X_POPULATION",
       "inverse": false,
       "args": {
        "Amount": "15"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "POLICY_LOGISTICS",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_MERCANTILISM",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "LOGISTICS_FRIENDLYTERRITORYMOVEMENTBONUS",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_ADJUST_UNIT_FRIENDLY_TERRITORY_START_MOVEMENT",
    "args": {
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "POLICY_TRIANGULAR_TRADE",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_MERCANTILISM",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_ECOMMERCE",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "TRIANGULARTRADE_TRADEROUTEGOLD",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_TRADE_ROUTE_YIELD",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "4"
    }
   },
   {
    "id": "TRIANGULARTRADE_TRADEROUTEFAITH",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_TRADE_ROUTE_YIELD",
    "args": {
     "YieldType": "YIELD_FAITH",
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "POLICY_RATIONALISM",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_THE_ENLIGHTENMENT",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "RATIONALISM_BUILDING_YIELDS_HIGH_ADJACENCY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_MODIFIERS_FOR_DISTRICT",
    "args": {
     "DistrictType": "DISTRICT_CAMPUS",
     "YieldType": "YIELD_SCIENCE",
     "Amount": "50"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_HIGH_ADJACENCY_DISTRICT",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_CAMPUS",
        "YieldType": "YIELD_SCIENCE",
        "Amount": "4"
       }
      }
     ]
    }
   },
   {
    "id": "RATIONALISM_BUILDING_YIELDS_HIGH_POP",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_MODIFIERS_FOR_DISTRICT",
    "args": {
     "DistrictType": "DISTRICT_CAMPUS",
     "YieldType": "YIELD_SCIENCE",
     "Amount": "50"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_X_POPULATION",
       "inverse": false,
       "args": {
        "Amount": "15"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "POLICY_FREE_MARKET",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_THE_ENLIGHTENMENT",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "FREEMARKET_BUILDING_YIELDS_HIGH_ADJACENCY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_MODIFIERS_FOR_DISTRICT",
    "args": {
     "DistrictType": "DISTRICT_COMMERCIAL_HUB",
     "YieldType": "YIELD_GOLD",
     "Amount": "50"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_HIGH_ADJACENCY_DISTRICT",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_COMMERCIAL_HUB",
        "YieldType": "YIELD_GOLD",
        "Amount": "4"
       }
      }
     ]
    }
   },
   {
    "id": "FREEMARKET_BUILDING_YIELDS_HIGH_POP",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_MODIFIERS_FOR_DISTRICT",
    "args": {
     "DistrictType": "DISTRICT_COMMERCIAL_HUB",
     "YieldType": "YIELD_GOLD",
     "Amount": "50"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_X_POPULATION",
       "inverse": false,
       "args": {
        "Amount": "15"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "POLICY_LIBERALISM",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_THE_ENLIGHTENMENT",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "LIBERALISM_SPECIALTYAMENITY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_POLICY_AMENITY",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_X_SPECIALTY_DISTRICTS",
       "inverse": false,
       "args": {
        "Amount": "2"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "POLICY_NATIVE_CONQUEST",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_COLONIALISM",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "NATIVECONQUEST_ADJUSTPOSTCOMBATYIELD",
    "collection": "COLLECTION_PLAYER_COMBAT",
    "effect": "EFFECT_ADJUST_UNIT_POST_COMBAT_YIELD",
    "args": {
     "YieldType": "YIELD_GOLD",
     "PercentDefeatedStrength": "50",
     "OnlyWhenDefeatedEarlierEraUnit": "true"
    }
   }
  ]
 },
 {
  "type": "POLICY_COLONIAL_TAXES",
  "slot": "SLOT_DIPLOMATIC",
  "civic": "CIVIC_COLONIALISM",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "COLONIALTAXES_FOREIGNGOLD",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "25"
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
   },
   {
    "id": "COLONIALTAXES_FOREIGNPRODUCTION",
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
       "type": "REQUIREMENT_CITY_IS_OWNER_CAPITAL_CONTINENT",
       "inverse": true,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "POLICY_RAJ",
  "slot": "SLOT_DIPLOMATIC",
  "civic": "CIVIC_COLONIALISM",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "RAJ_GOLDPERTRIBUTARY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_YIELD_CHANGE_PER_TRIBUTARY",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "2"
    }
   },
   {
    "id": "RAJ_FAITHPERTRIBUTARY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_YIELD_CHANGE_PER_TRIBUTARY",
    "args": {
     "YieldType": "YIELD_FAITH",
     "Amount": "2"
    }
   },
   {
    "id": "RAJ_SCIENCEPERTRIBUTARY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_YIELD_CHANGE_PER_TRIBUTARY",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "2"
    }
   },
   {
    "id": "RAJ_CULTUREPERTRIBUTARY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_YIELD_CHANGE_PER_TRIBUTARY",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "Amount": "2"
    }
   },
   {
    "id": "RAJ_CITY_TRADE_ROUTE_GOLD",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_STATE_TRADE_ROUTE_FLAT_YIELD",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "2"
    }
   }
  ]
 },
 {
  "type": "POLICY_PUBLIC_WORKS",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_CIVIL_ENGINEERING",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "PUBLICWORKS_BUILDERPRODUCTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_UNIT_PRODUCTION",
    "args": {
     "UnitType": "UNIT_BUILDER",
     "Amount": "30"
    }
   },
   {
    "id": "PUBLICWORKS_BUILDERCHARGES",
    "collection": "COLLECTION_PLAYER_TRAINED_UNITS",
    "effect": "EFFECT_ADJUST_UNIT_BUILD_CHARGES",
    "args": {
     "Amount": "2"
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
   }
  ]
 },
 {
  "type": "POLICY_SKYSCRAPERS",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_CIVIL_ENGINEERING",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "SKYSCRAPERS_INDUSTRIALINFORMATION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_WONDER_ERA_PRODUCTION",
    "args": {
     "Amount": "15",
     "IsWonder": "true",
     "StartEra": "ERA_ANCIENT",
     "EndEra": "ERA_FUTURE"
    }
   }
  ]
 },
 {
  "type": "POLICY_GRANDE_ARMEE",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_NATIONALISM",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_MILITARY_FIRST",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "GRANDEARMEE_INDUSTRIAL_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_MELEE",
     "EraType": "ERA_INDUSTRIAL",
     "Amount": "50"
    }
   },
   {
    "id": "GRANDEARMEE_MODERN_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_MELEE",
     "EraType": "ERA_MODERN",
     "Amount": "50"
    }
   },
   {
    "id": "GRANDEARMEE_INDUSTRIAL_ANTI_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY",
     "EraType": "ERA_INDUSTRIAL",
     "Amount": "50"
    }
   },
   {
    "id": "GRANDEARMEE_MODERN_ANTI_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY",
     "EraType": "ERA_MODERN",
     "Amount": "50"
    }
   },
   {
    "id": "GRANDEARMEE_INDUSTRIAL_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_RANGED",
     "EraType": "ERA_INDUSTRIAL",
     "Amount": "50"
    }
   },
   {
    "id": "GRANDEARMEE_MODERN_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_RANGED",
     "EraType": "ERA_MODERN",
     "Amount": "50"
    }
   },
   {
    "id": "AGOGE_ANCIENT_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_MELEE",
     "EraType": "ERA_ANCIENT",
     "Amount": "50"
    }
   },
   {
    "id": "AGOGE_CLASSICAL_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_MELEE",
     "EraType": "ERA_CLASSICAL",
     "Amount": "50"
    }
   },
   {
    "id": "AGOGE_ANCIENT_ANTI_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY",
     "EraType": "ERA_ANCIENT",
     "Amount": "50"
    }
   },
   {
    "id": "AGOGE_CLASSICAL_ANTI_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY",
     "EraType": "ERA_CLASSICAL",
     "Amount": "50"
    }
   },
   {
    "id": "AGOGE_ANCIENT_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_RANGED",
     "EraType": "ERA_ANCIENT",
     "Amount": "50"
    }
   },
   {
    "id": "FEUDALCONTRACT_MEDIEVAL_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_MELEE",
     "EraType": "ERA_MEDIEVAL",
     "Amount": "50"
    }
   },
   {
    "id": "FEUDALCONTRACT_RENAISSANCE_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_MELEE",
     "EraType": "ERA_RENAISSANCE",
     "Amount": "50"
    }
   },
   {
    "id": "FEUDALCONTRACT_MEDIEVAL_ANTI_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY",
     "EraType": "ERA_MEDIEVAL",
     "Amount": "50"
    }
   },
   {
    "id": "FEUDALCONTRACT_RENAISSANCE_ANTI_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY",
     "EraType": "ERA_RENAISSANCE",
     "Amount": "50"
    }
   },
   {
    "id": "FEUDALCONTRACT_MEDIEVAL_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_RANGED",
     "EraType": "ERA_MEDIEVAL",
     "Amount": "50"
    }
   },
   {
    "id": "FEUDALCONTRACT_RENAISSANCE_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_RANGED",
     "EraType": "ERA_RENAISSANCE",
     "Amount": "50"
    }
   }
  ]
 },
 {
  "type": "POLICY_NATIONAL_IDENTITY",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_NATIONALISM",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "NATIONALIDENTITY_REDUCESTRENGTHREDUCTIONFORDAMAGE",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_ADJUST_UNIT_STRENGTH_REDUCTION_FOR_DAMAGE_MODIFIER",
    "args": {
     "Amount": "50"
    }
   }
  ]
 },
 {
  "type": "POLICY_GRAND_OPERA",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_OPERA_BALLET",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "GRANDOPERA_BUILDING_YIELDS_HIGH_ADJACENCY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_MODIFIERS_FOR_DISTRICT",
    "args": {
     "DistrictType": "DISTRICT_THEATER",
     "YieldType": "YIELD_CULTURE",
     "Amount": "50"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_HIGH_ADJACENCY_DISTRICT",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_THEATER",
        "YieldType": "YIELD_CULTURE",
        "Amount": "4"
       }
      }
     ]
    }
   },
   {
    "id": "GRANDOPERA_BUILDING_YIELDS_HIGH_POP",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_MODIFIERS_FOR_DISTRICT",
    "args": {
     "DistrictType": "DISTRICT_THEATER",
     "YieldType": "YIELD_CULTURE",
     "Amount": "50"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_X_POPULATION",
       "inverse": false,
       "args": {
        "Amount": "15"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "POLICY_SYMPHONIES",
  "slot": "SLOT_GREAT_PERSON",
  "civic": "CIVIC_OPERA_BALLET",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": null,
    "gpClass": "GREAT_PERSON_CLASS_MUSICIAN"
   }
  ],
  "modifiers": [
   {
    "id": "SYMPHONIES_GREATMUSICIANPOINTS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_MUSICIAN",
     "Amount": "4"
    }
   },
   {
    "id": "SYMPHONIES_MUSICIAN_BROADCASTCENTER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_MUSICIAN",
     "Amount": "4"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_BROADCAST_CENTER"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "POLICY_PUBLIC_TRANSPORT",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_URBANIZATION",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "PUBLICTRANSPORT_FARMREPLACEGOLD",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_DISTRICT_CREATE_YIELD",
    "args": {
     "DistrictType": "DISTRICT_NEIGHBORHOOD",
     "Amount": "100",
     "YieldType": "YIELD_GOLD",
     "YieldBasedOnAppeal": "true",
     "MustReplaceImprovement": "true",
     "ImprovementType": "IMPROVEMENT_FARM"
    }
   },
   {
    "id": "PUBLICTRANSPORT_NEIGHBORHOOD_GOLD",
    "collection": "COLLECTION_PLAYER_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_DISTRICT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_NEIGHBORHOOD"
       }
      }
     ]
    }
   },
   {
    "id": "PUBLICTRANSPORT_CHARMING_NEIGHBORHOOD_FOOD",
    "collection": "COLLECTION_PLAYER_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FOOD",
     "Amount": "3"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_IS_APPEAL_BETWEEN",
       "inverse": false,
       "args": {
        "MinimumAppeal": "2"
       }
      },
      {
       "type": "REQUIREMENT_DISTRICT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_NEIGHBORHOOD"
       }
      }
     ]
    }
   },
   {
    "id": "PUBLICTRANSPORT_CHARMING_NEIGHBORHOOD_PRODUCTION",
    "collection": "COLLECTION_PLAYER_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_IS_APPEAL_BETWEEN",
       "inverse": false,
       "args": {
        "MinimumAppeal": "2"
       }
      },
      {
       "type": "REQUIREMENT_DISTRICT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_NEIGHBORHOOD"
       }
      }
     ]
    }
   },
   {
    "id": "PUBLICTRANSPORT_BREATHTAKING_NEIGHBORHOOD_FOOD",
    "collection": "COLLECTION_PLAYER_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FOOD",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_IS_APPEAL_BETWEEN",
       "inverse": false,
       "args": {
        "MinimumAppeal": "4"
       }
      },
      {
       "type": "REQUIREMENT_DISTRICT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_NEIGHBORHOOD"
       }
      }
     ]
    }
   },
   {
    "id": "PUBLICTRANSPORT_BREATHTAKING_NEIGHBORHOOD_PRODUCTION",
    "collection": "COLLECTION_PLAYER_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_IS_APPEAL_BETWEEN",
       "inverse": false,
       "args": {
        "MinimumAppeal": "4"
       }
      },
      {
       "type": "REQUIREMENT_DISTRICT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_NEIGHBORHOOD"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "POLICY_TOTAL_WAR",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_SCORCHED_EARTH",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "TOTALWAR_DOUBLEPILLAGEDISTRICT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_UNIT_PILLAGE_DISTRICT_MODIFIER",
    "args": {
     "Amount": "50"
    }
   },
   {
    "id": "TOTALWAR_DOUBLEPILLAGEIMPROVE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_UNIT_PILLAGE_IMPROVEMENT_MODIFIER",
    "args": {
     "Amount": "50"
    }
   },
   {
    "id": "TOTAL_WAR_PLUNDER_BONUS",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_ADJUST_UNIT_PLUNDER_YIELDS",
    "args": {
     "Amount": "50"
    }
   }
  ]
 },
 {
  "type": "POLICY_EXPROPRIATION",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_SCORCHED_EARTH",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "EXPROPRIATION_SETTLERPRODUCTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_UNIT_PRODUCTION",
    "args": {
     "UnitType": "UNIT_SETTLER",
     "Amount": "50"
    }
   },
   {
    "id": "EXPROPRIATION_PLOTPURCHASECOST",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_PLOT_PURCHASE_COST",
    "args": {
     "Amount": "-20"
    }
   }
  ]
 },
 {
  "type": "POLICY_MILITARY_ORGANIZATION",
  "slot": "SLOT_GREAT_PERSON",
  "civic": "CIVIC_SCORCHED_EARTH",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": null,
    "gpClass": "GREAT_PERSON_CLASS_GENERAL"
   }
  ],
  "modifiers": [
   {
    "id": "MILITARYORGANIZATION_GREATGENERAL_ARMORY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_GENERAL",
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_ARMORY"
       }
      }
     ]
    }
   },
   {
    "id": "MILITARYORGANIZATION_GREATGENERAL_MILITARYACADEMY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_GENERAL",
     "Amount": "4"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_MILITARY_ACADEMY"
       }
      }
     ]
    }
   },
   {
    "id": "MILITARYORGANIZATION_GREATGENERAL_MOVEMENT",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_MILITARYORGANIZATION_MOVEMENT"
    },
    "ability": [
     {
      "id": "MILITARYORGANIZATION_MOVEMENT",
      "collection": "COLLECTION_OWNER",
      "effect": "EFFECT_ADJUST_UNIT_MOVEMENT",
      "args": {
       "Amount": "2"
      }
     }
    ],
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_UNIT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "UnitType": "UNIT_GREAT_GENERAL"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "POLICY_MILITARY_RESEARCH",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_URBANIZATION",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_INTEGRATED_SPACE_CELL",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "MILITARYRESEARCH_MILITARY_ACADEMY_SCIENCE_MODIFIER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "BuildingType": "BUILDING_MILITARY_ACADEMY",
     "YieldType": "YIELD_SCIENCE",
     "Amount": "2"
    }
   },
   {
    "id": "MILITARYRESEARCH_SEAPORT_SCIENCE_MODIFIER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "BuildingType": "BUILDING_SEAPORT",
     "YieldType": "YIELD_SCIENCE",
     "Amount": "2"
    }
   },
   {
    "id": "MILITARYRESEARCH_RENAISSANCE_WALLS_SCIENCE_MODIFIER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "BuildingType": "BUILDING_STAR_FORT",
     "YieldType": "YIELD_SCIENCE",
     "Amount": "2"
    }
   }
  ]
 },
 {
  "type": "POLICY_RESOURCE_MANAGEMENT",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_CONSERVATION",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "RESOURCE_MANAGEMENT_ADDITIONAL_ALUMINUM_EXTRACTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_RESOURCE_ACCUMULATION_MODIFIER",
    "args": {
     "Amount": "1",
     "ResourceType": "RESOURCE_ALUMINUM"
    }
   },
   {
    "id": "RESOURCE_MANAGEMENT_ADDITIONAL_OIL_EXTRACTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_RESOURCE_ACCUMULATION_MODIFIER",
    "args": {
     "Amount": "1",
     "ResourceType": "RESOURCE_OIL"
    }
   }
  ]
 },
 {
  "type": "POLICY_PROPAGANDA",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_MASS_MEDIA",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "PROPAGANDA_OVERALLWARWEARINESS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_WAR_WEARINESS",
    "args": {
     "Amount": "-25",
     "Overall": "true"
    }
   }
  ]
 },
 {
  "type": "POLICY_LEVEE_EN_MASSE",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_MOBILIZATION",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "LEVEEENMASSE_UNITMAINTENANCEDISCOUNT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_UNIT_MAINTENANCE_DISCOUNT",
    "args": {
     "Amount": "2"
    }
   }
  ]
 },
 {
  "type": "POLICY_LAISSEZ_FAIRE",
  "slot": "SLOT_GREAT_PERSON",
  "civic": "CIVIC_CAPITALISM",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": null,
    "gpClass": "GREAT_PERSON_CLASS_MERCHANT"
   }
  ],
  "modifiers": [
   {
    "id": "LAISSEZFAIRE_MERCHANT_BANK",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_MERCHANT",
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_BANK"
       }
      }
     ]
    }
   },
   {
    "id": "LAISSEZFAIRE_MERCHANT_STOCKEXCHANGE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_MERCHANT",
     "Amount": "4"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_STOCK_EXCHANGE"
       }
      }
     ]
    }
   },
   {
    "id": "LAISSEZFAIRE_ADMIRAL_SHIPYARD",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_ADMIRAL",
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_SHIPYARD"
       }
      }
     ]
    }
   },
   {
    "id": "LAISSEZFAIRE_ADMIRAL_SEAPORT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_ADMIRAL",
     "Amount": "4"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_SEAPORT"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "POLICY_MARKET_ECONOMY",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_CAPITALISM",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "MARKETECONOMY_TRADEROUTECULTURE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_TRADE_ROUTE_YIELD_FOR_INTERNATIONAL",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "Amount": "2"
    }
   },
   {
    "id": "MARKETECONOMY_TRADEROUTESCIENCE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_TRADE_ROUTE_YIELD_FOR_INTERNATIONAL",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "2"
    }
   },
   {
    "id": "MARKETECONOMY_TRADEROUTEGOLDPERLUXURY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_TRADE_ROUTE_YIELD_PER_DESTINATION_LUXURY_RESOURCE_FOR_INTERNATIONAL",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "1"
    }
   },
   {
    "id": "MARKETECONOMY_TRADEROUTEGOLDPERSTRATEGIC",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_TRADE_ROUTE_YIELD_PER_DESTINATION_STRATEGIC_RESOURCE_FOR_INTERNATIONAL",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "POLICY_NOBEL_PRIZE",
  "slot": "SLOT_GREAT_PERSON",
  "civic": "CIVIC_NUCLEAR_PROGRAM",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "SCIENCEFOUNDATION_SCIENTIST_UNIVERSITY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_SCIENTIST",
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_UNIVERSITY"
       }
      }
     ]
    }
   },
   {
    "id": "SCIENCEFOUNDATION_SCIENTIST_RESEARCHLAB",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_SCIENTIST",
     "Amount": "4"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_RESEARCH_LAB"
       }
      }
     ]
    }
   },
   {
    "id": "SCIENCEFOUNDATION_ENGINEER_FACTORY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_ENGINEER",
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_FACTORY"
       }
      }
     ]
    }
   },
   {
    "id": "SCIENCEFOUNDATION_ENGINEER_POWERPLANT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_ENGINEER",
     "Amount": "4"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_POWER_PLANT"
       }
      },
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_COAL_POWER_PLANT"
       }
      },
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_FOSSIL_FUEL_POWER_PLANT"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "POLICY_NUCLEAR_ESPIONAGE",
  "slot": "SLOT_DIPLOMATIC",
  "civic": "CIVIC_NUCLEAR_PROGRAM",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "NUCLEARESPIONAGE_EXTRABOOSTS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_STEAL_TECH_BOOSTS",
    "args": {
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "POLICY_ECONOMIC_UNION",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_IDEOLOGY",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "ECONOMICUNION_HARBORGOLD",
    "collection": "COLLECTION_PLAYER_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "100"
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
    "id": "ECONOMICUNION_COMMERCIALGOLD",
    "collection": "COLLECTION_PLAYER_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "100"
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
   }
  ]
 },
 {
  "type": "POLICY_FINEST_HOUR",
  "slot": "SLOT_WILDCARD",
  "civic": "CIVIC_SUFFRAGE",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": "GOVERNMENT_DEMOCRACY",
  "obsolete": [],
  "modifiers": [
   {
    "id": "FINEST_HOUR_FRIENDLY_TERRITORY",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_FINEST_HOUR_FRIENDLY_TERRITORY"
    },
    "ability": [
     {
      "id": "FINEST_HOUR_FRIENDLY_BUFF",
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
    ]
   }
  ]
 },
 {
  "type": "POLICY_NEW_DEAL",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_SUFFRAGE",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": "GOVERNMENT_DEMOCRACY",
  "obsolete": [],
  "modifiers": [
   {
    "id": "NEWDEAL_SPECIALTYAMENITY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_POLICY_AMENITY",
    "args": {
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_X_SPECIALTY_DISTRICTS",
       "inverse": false,
       "args": {
        "Amount": "3"
       }
      }
     ]
    }
   },
   {
    "id": "NEWDEAL_SPECIALTYHOUSING",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_POLICY_HOUSING",
    "args": {
     "Amount": "4"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_X_SPECIALTY_DISTRICTS",
       "inverse": false,
       "args": {
        "Amount": "3"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "POLICY_LIGHTNING_WARFARE",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_IDEOLOGY",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "LIGHTNINGWARFARE_MODERN_HEAVY_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_HEAVY_CAVALRY",
     "EraType": "ERA_MODERN",
     "Amount": "50"
    }
   },
   {
    "id": "LIGHTNINGWARFARE_ATOMIC_HEAVY_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_HEAVY_CAVALRY",
     "EraType": "ERA_ATOMIC",
     "Amount": "50"
    }
   },
   {
    "id": "LIGHTNINGWARFARE_INFORMATION_HEAVY_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_HEAVY_CAVALRY",
     "EraType": "ERA_INFORMATION",
     "Amount": "50"
    }
   },
   {
    "id": "LIGHTNINGWARFARE_MODERN_LIGHT_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_LIGHT_CAVALRY",
     "EraType": "ERA_MODERN",
     "Amount": "50"
    }
   },
   {
    "id": "LIGHTNINGWARFARE_ATOMIC_LIGHT_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_LIGHT_CAVALRY",
     "EraType": "ERA_ATOMIC",
     "Amount": "50"
    }
   },
   {
    "id": "LIGHTNINGWARFARE_INFORMATION_LIGHT_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_LIGHT_CAVALRY",
     "EraType": "ERA_INFORMATION",
     "Amount": "50"
    }
   },
   {
    "id": "CHIVALRY_MEDIEVAL_HEAVY_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_HEAVY_CAVALRY",
     "EraType": "ERA_MEDIEVAL",
     "Amount": "50"
    }
   },
   {
    "id": "CHIVALRY_RENAISSANCE_HEAVY_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_HEAVY_CAVALRY",
     "EraType": "ERA_RENAISSANCE",
     "Amount": "50"
    }
   },
   {
    "id": "CHIVALRY_INDUSTRIAL_HEAVY_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_HEAVY_CAVALRY",
     "EraType": "ERA_INDUSTRIAL",
     "Amount": "50"
    }
   },
   {
    "id": "CHIVALRY_MEDIEVAL_LIGHT_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_LIGHT_CAVALRY",
     "EraType": "ERA_MEDIEVAL",
     "Amount": "50"
    }
   },
   {
    "id": "CHIVALRY_RENAISSANCE_LIGHT_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_LIGHT_CAVALRY",
     "EraType": "ERA_RENAISSANCE",
     "Amount": "50"
    }
   },
   {
    "id": "CHIVALRY_INDUSTRIAL_LIGHT_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_LIGHT_CAVALRY",
     "EraType": "ERA_INDUSTRIAL",
     "Amount": "50"
    }
   },
   {
    "id": "MANEUVER_ANCIENT_HEAVY_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_HEAVY_CAVALRY",
     "EraType": "ERA_ANCIENT",
     "Amount": "50"
    }
   },
   {
    "id": "MANEUVER_CLASSICAL_HEAVY_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_HEAVY_CAVALRY",
     "EraType": "ERA_CLASSICAL",
     "Amount": "50"
    }
   },
   {
    "id": "MANEUVER_ANCIENT_LIGHT_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_LIGHT_CAVALRY",
     "EraType": "ERA_ANCIENT",
     "Amount": "50"
    }
   },
   {
    "id": "MANEUVER_CLASSICAL_LIGHT_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_LIGHT_CAVALRY",
     "EraType": "ERA_CLASSICAL",
     "Amount": "50"
    }
   }
  ]
 },
 {
  "type": "POLICY_THIRD_ALTERNATIVE",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_TOTALITARIANISM",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": "GOVERNMENT_FASCISM",
  "obsolete": [],
  "modifiers": [
   {
    "id": "THIRDALTERNATIVE_MILITARY_ACADEMY_GOLD_MODIFIER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "BuildingType": "BUILDING_MILITARY_ACADEMY",
     "YieldType": "YIELD_GOLD",
     "Amount": "4"
    }
   },
   {
    "id": "THIRDALTERNATIVE_RESEARCH_LAB_GOLD_MODIFIER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "BuildingType": "BUILDING_RESEARCH_LAB",
     "YieldType": "YIELD_GOLD",
     "Amount": "4"
    }
   },
   {
    "id": "THIRDALTERNATIVE_POWER_PLANT_GOLD_MODIFIER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "BuildingType": "BUILDING_POWER_PLANT",
     "YieldType": "YIELD_GOLD",
     "Amount": "4"
    }
   },
   {
    "id": "THIRDALTERNATIVE_MILITARY_ACADEMY_CULTURE_MODIFIER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "BuildingType": "BUILDING_MILITARY_ACADEMY",
     "YieldType": "YIELD_CULTURE",
     "Amount": "2"
    }
   },
   {
    "id": "THIRDALTERNATIVE_RESEARCH_LAB_CULTURE_MODIFIER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "BuildingType": "BUILDING_RESEARCH_LAB",
     "YieldType": "YIELD_CULTURE",
     "Amount": "2"
    }
   },
   {
    "id": "THIRDALTERNATIVE_COAL_POWER_PLANT_CULTURE_MODIFIER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "BuildingType": "BUILDING_COAL_POWER_PLANT",
     "YieldType": "YIELD_CULTURE",
     "Amount": "2"
    }
   },
   {
    "id": "THIRDALTERNATIVE_FOSSIL_FUEL_POWER_PLANT_CULTURE_MODIFIER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "BuildingType": "BUILDING_FOSSIL_FUEL_POWER_PLANT",
     "YieldType": "YIELD_CULTURE",
     "Amount": "2"
    }
   },
   {
    "id": "THIRDALTERNATIVE_POWER_PLANT_CULTURE_MODIFIER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "BuildingType": "BUILDING_POWER_PLANT",
     "YieldType": "YIELD_CULTURE",
     "Amount": "2"
    }
   },
   {
    "id": "THIRDALTERNATIVE_COAL_POWER_PLANT_GOLD_MODIFIER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "BuildingType": "BUILDING_COAL_POWER_PLANT",
     "YieldType": "YIELD_GOLD",
     "Amount": "4"
    }
   },
   {
    "id": "THIRDALTERNATIVE_FOSSIL_FUEL_POWER_PLANT_GOLD_MODIFIER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "BuildingType": "BUILDING_FOSSIL_FUEL_POWER_PLANT",
     "YieldType": "YIELD_GOLD",
     "Amount": "4"
    }
   }
  ]
 },
 {
  "type": "POLICY_MARTIAL_LAW",
  "slot": "SLOT_WILDCARD",
  "civic": "CIVIC_TOTALITARIANISM",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": "GOVERNMENT_FASCISM",
  "obsolete": [],
  "modifiers": [
   {
    "id": "MARTIALLAW_OVERALLWARWEARINESS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_WAR_WEARINESS",
    "args": {
     "Amount": "-25",
     "Overall": "true"
    }
   },
   {
    "id": "MARTIALLAW_GARRISONIDENTITY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_IDENTITY_PER_TURN",
    "args": {
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_GARRISON_UNIT",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "POLICY_GUNBOAT_DIPLOMACY",
  "slot": "SLOT_DIPLOMATIC",
  "civic": "CIVIC_IDEOLOGY",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "GUNBOATDIPLOMACY_OPENBORDERS",
    "collection": "COLLECTION_ALL_PLAYERS",
    "effect": "EFFECT_ADJUST_PLAYER_OPEN_BORDERS_FROM_INFLUENCE",
    "args": {},
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_MINOR",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "GUNBOATDIPLOMACY_INFLUENCEPOINTS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_INFLUENCE_POINTS_PER_TURN",
    "args": {
     "Amount": "4"
    }
   }
  ]
 },
 {
  "type": "POLICY_FIVE_YEAR_PLAN",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_IDEOLOGY",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "FIVEYEARPLAN_DISTRICTSCIENCE",
    "collection": "COLLECTION_PLAYER_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "100"
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
    "id": "FIVEYEARPLAN_DISTRICTPRODUCTION",
    "collection": "COLLECTION_PLAYER_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "100"
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
   }
  ]
 },
 {
  "type": "POLICY_COLLECTIVIZATION",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_CLASS_STRUGGLE",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": "GOVERNMENT_COMMUNISM",
  "obsolete": [],
  "modifiers": [
   {
    "id": "COLLECTIVIZATION_INTERNAL_TRADE_FOOD",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_TRADE_ROUTE_YIELD_FOR_DOMESTIC",
    "args": {
     "YieldType": "YIELD_FOOD",
     "Amount": "4"
    }
   },
   {
    "id": "COLLECTIVIZATION_INTERNAL_TRADE_PRODUCTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_TRADE_ROUTE_YIELD_FOR_DOMESTIC",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "2"
    }
   }
  ]
 },
 {
  "type": "POLICY_DEFENSE_OF_MOTHERLAND",
  "slot": "SLOT_WILDCARD",
  "civic": "CIVIC_CLASS_STRUGGLE",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": "GOVERNMENT_COMMUNISM",
  "obsolete": [],
  "modifiers": [
   {
    "id": "DEFENSEOFMOTHERLAND_DOMESTICWARWEARINESS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_WAR_WEARINESS",
    "args": {
     "Amount": "-100",
     "Domestic": "true"
    }
   },
   {
    "id": "DEFENSEOFMOTHERLAND_MODERN_SUPPORT_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_SUPPORT",
     "EraType": "ERA_MODERN",
     "Amount": "100"
    }
   },
   {
    "id": "DEFENSEOFMOTHERLAND_ATOMIC_SUPPORT_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_SUPPORT",
     "EraType": "ERA_ATOMIC",
     "Amount": "100"
    }
   },
   {
    "id": "DEFENSEOFMOTHERLAND_INFORMATION_SUPPORT_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_SUPPORT",
     "EraType": "ERA_INFORMATION",
     "Amount": "100"
    }
   }
  ]
 },
 {
  "type": "POLICY_CRYPTOGRAPHY",
  "slot": "SLOT_DIPLOMATIC",
  "civic": "CIVIC_COLD_WAR",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "CRYPTOGRAPHY_OFFENSE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_SPY_BONUS",
    "args": {
     "Offense": "true",
     "Amount": "1"
    }
   },
   {
    "id": "CRYPTOGRAPHY_DEFENSE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_SPY_BONUS",
    "args": {
     "Offense": "false",
     "Amount": "2"
    }
   }
  ]
 },
 {
  "type": "POLICY_INTERNATIONAL_WATERS",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_COLD_WAR",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "INTERNATIONALWATERS_MODERN_NAVAL_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_MELEE",
     "EraType": "ERA_MODERN",
     "Amount": "100"
    }
   },
   {
    "id": "INTERNATIONALWATERS_ATOMIC_NAVAL_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_MELEE",
     "EraType": "ERA_ATOMIC",
     "Amount": "100"
    }
   },
   {
    "id": "INTERNATIONALWATERS_INFORMATION_NAVAL_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_MELEE",
     "EraType": "ERA_INFORMATION",
     "Amount": "100"
    }
   },
   {
    "id": "INTERNATIONALWATERS_MODERN_NAVAL_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RANGED",
     "EraType": "ERA_MODERN",
     "Amount": "100"
    }
   },
   {
    "id": "INTERNATIONALWATERS_ATOMIC_NAVAL_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RANGED",
     "EraType": "ERA_ATOMIC",
     "Amount": "100"
    }
   },
   {
    "id": "INTERNATIONALWATERS_INFORMATION_NAVAL_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RANGED",
     "EraType": "ERA_INFORMATION",
     "Amount": "100"
    }
   },
   {
    "id": "INTERNATIONALWATERS_MODERN_NAVAL_RAIDER_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RAIDER",
     "EraType": "ERA_MODERN",
     "Amount": "100"
    }
   },
   {
    "id": "INTERNATIONALWATERS_ATOMIC_NAVAL_RAIDER_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RAIDER",
     "EraType": "ERA_ATOMIC",
     "Amount": "100"
    }
   },
   {
    "id": "INTERNATIONALWATERS_INFORMATION_NAVAL_RAIDER_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RAIDER",
     "EraType": "ERA_INFORMATION",
     "Amount": "100"
    }
   },
   {
    "id": "PRESSGANGS_RENAISSANCE_NAVAL_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_MELEE",
     "EraType": "ERA_RENAISSANCE",
     "Amount": "100"
    }
   },
   {
    "id": "PRESSGANGS_INDUSTRIAL_NAVAL_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_MELEE",
     "EraType": "ERA_INDUSTRIAL",
     "Amount": "100"
    }
   },
   {
    "id": "PRESSGANGS_RENAISSANCE_NAVAL_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RANGED",
     "EraType": "ERA_RENAISSANCE",
     "Amount": "100"
    }
   },
   {
    "id": "PRESSGANGS_INDUSTRIAL_NAVAL_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RANGED",
     "EraType": "ERA_INDUSTRIAL",
     "Amount": "100"
    }
   },
   {
    "id": "PRESSGANGS_RENAISSANCE_NAVAL_RAIDER_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RAIDER",
     "EraType": "ERA_RENAISSANCE",
     "Amount": "100"
    }
   },
   {
    "id": "PRESSGANGS_INDUSTRIAL_NAVAL_RAIDER_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RAIDER",
     "EraType": "ERA_INDUSTRIAL",
     "Amount": "100"
    }
   },
   {
    "id": "MARITIMIEINDUSTRIES_ANCIENT_NAVAL_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_MELEE",
     "EraType": "ERA_ANCIENT",
     "Amount": "100"
    }
   },
   {
    "id": "MARITIMIEINDUSTRIES_CLASSICAL_NAVAL_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_MELEE",
     "EraType": "ERA_CLASSICAL",
     "Amount": "100"
    }
   },
   {
    "id": "MARITIMIEINDUSTRIES_ANCIENT_NAVAL_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RANGED",
     "EraType": "ERA_ANCIENT",
     "Amount": "100"
    }
   },
   {
    "id": "MARITIMIEINDUSTRIES_CLASSICAL_NAVAL_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RANGED",
     "EraType": "ERA_CLASSICAL",
     "Amount": "100"
    }
   },
   {
    "id": "MARITIMIEINDUSTRIES_ANCIENT_NAVAL_RAIDER_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RAIDER",
     "EraType": "ERA_ANCIENT",
     "Amount": "100"
    }
   },
   {
    "id": "MARITIMIEINDUSTRIES_CLASSICAL_NAVAL_RAIDER_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RAIDER",
     "EraType": "ERA_CLASSICAL",
     "Amount": "100"
    }
   },
   {
    "id": "PRESSGANGS_MEDIEVAL_NAVAL_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_MELEE",
     "EraType": "ERA_MEDIEVAL",
     "Amount": "100"
    }
   },
   {
    "id": "PRESSGANGS_MEDIEVAL_NAVAL_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RANGED",
     "EraType": "ERA_MEDIEVAL",
     "Amount": "100"
    }
   },
   {
    "id": "PRESSGANGS_MEDIEVAL_NAVAL_RAIDER_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RAIDER",
     "EraType": "ERA_MEDIEVAL",
     "Amount": "100"
    }
   }
  ]
 },
 {
  "type": "POLICY_CONTAINMENT",
  "slot": "SLOT_DIPLOMATIC",
  "civic": "CIVIC_COLD_WAR",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "CONTAINMENT_DUPLICATETOKENWHENRIVALGOVERNMENT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_DUPLICATE_INFLUENCE_TOKEN_WHEN_RIVAL_GOVERNMENT",
    "args": {
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "POLICY_HERITAGE_TOURISM",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_CULTURAL_HERITAGE",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "HERITAGE_SCULPTURETOURISM",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_TOURISM",
    "args": {
     "GreatWorkObjectType": "GREATWORKOBJECT_SCULPTURE",
     "ScalingFactor": "200"
    }
   },
   {
    "id": "HERITAGE_PORTRAITTOURISM",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_TOURISM",
    "args": {
     "GreatWorkObjectType": "GREATWORKOBJECT_PORTRAIT",
     "ScalingFactor": "200"
    }
   },
   {
    "id": "HERITAGE_LANDSCAPETOURISM",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_TOURISM",
    "args": {
     "GreatWorkObjectType": "GREATWORKOBJECT_LANDSCAPE",
     "ScalingFactor": "200"
    }
   },
   {
    "id": "HERITAGE_RELIGIOUSTOURISM",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_TOURISM",
    "args": {
     "GreatWorkObjectType": "GREATWORKOBJECT_RELIGIOUS",
     "ScalingFactor": "200"
    }
   },
   {
    "id": "HERITAGE_ARTIFACTTOURISM",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_TOURISM",
    "args": {
     "GreatWorkObjectType": "GREATWORKOBJECT_ARTIFACT",
     "ScalingFactor": "200"
    }
   }
  ]
 },
 {
  "type": "POLICY_SPORTS_MEDIA",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_PROFESSIONAL_SPORTS",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "SPORTSMEDIA_DISTRICTCULTURE",
    "collection": "COLLECTION_PLAYER_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "Amount": "100"
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
    "id": "SPORTSMEDIA_STADIUMENTERTAINMENT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_POLICY_AMENITY",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_STADIUM"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "POLICY_MILITARY_FIRST",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_RAPID_DEPLOYMENT",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "MILITARYFIRST_ATOMIC_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_MELEE",
     "EraType": "ERA_ATOMIC",
     "Amount": "50"
    }
   },
   {
    "id": "MILITARYFIRST_INFORMATION_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_MELEE",
     "EraType": "ERA_INFORMATION",
     "Amount": "50"
    }
   },
   {
    "id": "MILITARYFIRST_ATOMIC_ANTI_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY",
     "EraType": "ERA_ATOMIC",
     "Amount": "50"
    }
   },
   {
    "id": "MILITARYFIRST_INFORMATION_ANTI_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY",
     "EraType": "ERA_INFORMATION",
     "Amount": "50"
    }
   },
   {
    "id": "MILITARYFIRST_ATOMIC_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_RANGED",
     "EraType": "ERA_ATOMIC",
     "Amount": "50"
    }
   },
   {
    "id": "MILITARYFIRST_INFORMATION_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_RANGED",
     "EraType": "ERA_INFORMATION",
     "Amount": "50"
    }
   },
   {
    "id": "GRANDEARMEE_INDUSTRIAL_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_MELEE",
     "EraType": "ERA_INDUSTRIAL",
     "Amount": "50"
    }
   },
   {
    "id": "GRANDEARMEE_MODERN_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_MELEE",
     "EraType": "ERA_MODERN",
     "Amount": "50"
    }
   },
   {
    "id": "GRANDEARMEE_INDUSTRIAL_ANTI_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY",
     "EraType": "ERA_INDUSTRIAL",
     "Amount": "50"
    }
   },
   {
    "id": "GRANDEARMEE_MODERN_ANTI_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY",
     "EraType": "ERA_MODERN",
     "Amount": "50"
    }
   },
   {
    "id": "GRANDEARMEE_INDUSTRIAL_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_RANGED",
     "EraType": "ERA_INDUSTRIAL",
     "Amount": "50"
    }
   },
   {
    "id": "GRANDEARMEE_MODERN_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_RANGED",
     "EraType": "ERA_MODERN",
     "Amount": "50"
    }
   },
   {
    "id": "AGOGE_ANCIENT_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_MELEE",
     "EraType": "ERA_ANCIENT",
     "Amount": "50"
    }
   },
   {
    "id": "AGOGE_CLASSICAL_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_MELEE",
     "EraType": "ERA_CLASSICAL",
     "Amount": "50"
    }
   },
   {
    "id": "AGOGE_ANCIENT_ANTI_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY",
     "EraType": "ERA_ANCIENT",
     "Amount": "50"
    }
   },
   {
    "id": "AGOGE_CLASSICAL_ANTI_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY",
     "EraType": "ERA_CLASSICAL",
     "Amount": "50"
    }
   },
   {
    "id": "AGOGE_ANCIENT_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_RANGED",
     "EraType": "ERA_ANCIENT",
     "Amount": "50"
    }
   },
   {
    "id": "FEUDALCONTRACT_MEDIEVAL_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_MELEE",
     "EraType": "ERA_MEDIEVAL",
     "Amount": "50"
    }
   },
   {
    "id": "FEUDALCONTRACT_RENAISSANCE_MELEE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_MELEE",
     "EraType": "ERA_RENAISSANCE",
     "Amount": "50"
    }
   },
   {
    "id": "FEUDALCONTRACT_MEDIEVAL_ANTI_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY",
     "EraType": "ERA_MEDIEVAL",
     "Amount": "50"
    }
   },
   {
    "id": "FEUDALCONTRACT_RENAISSANCE_ANTI_CAVALRY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY",
     "EraType": "ERA_RENAISSANCE",
     "Amount": "50"
    }
   },
   {
    "id": "FEUDALCONTRACT_MEDIEVAL_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_RANGED",
     "EraType": "ERA_MEDIEVAL",
     "Amount": "50"
    }
   },
   {
    "id": "FEUDALCONTRACT_RENAISSANCE_RANGED_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_RANGED",
     "EraType": "ERA_RENAISSANCE",
     "Amount": "50"
    }
   }
  ]
 },
 {
  "type": "POLICY_SATELLITE_BROADCASTS",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_SPACE_RACE",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "SATELLITEBROADCASTS_MUSICTOURISM",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_TOURISM",
    "args": {
     "GreatWorkObjectType": "GREATWORKOBJECT_MUSIC",
     "ScalingFactor": "300"
    }
   }
  ]
 },
 {
  "type": "POLICY_INTEGRATED_SPACE_CELL",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_SPACE_RACE",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "INTEGRATEDSPACECELL_SPACE_RACE_PROJECTS_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_SPACE_RACE_PROJECTS_PRODUCTION",
    "args": {
     "Amount": "15"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_MILITARY_ACADEMY"
       }
      },
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_SEAPORT"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "POLICY_STRATEGIC_AIR_FORCE",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_GLOBALIZATION",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "STRATEGICAIRFORCE_INFORMATION_AIRFIGHTER_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_AIR_FIGHTER",
     "EraType": "ERA_INFORMATION",
     "Amount": "50"
    }
   },
   {
    "id": "STRATEGICAIRFORCE_INFORMATION_AIRBOMBER_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_AIR_BOMBER",
     "EraType": "ERA_INFORMATION",
     "Amount": "50"
    }
   },
   {
    "id": "STRATEGICAIRFORCE_ATOMIC_NAVALCARRIER_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_CARRIER",
     "EraType": "ERA_ATOMIC",
     "Amount": "50"
    }
   },
   {
    "id": "STRATEGICAIRFORCE_INFORMATION_NAVALCARRIER_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_CARRIER",
     "EraType": "ERA_INFORMATION",
     "Amount": "50"
    }
   }
  ]
 },
 {
  "type": "POLICY_ECOMMERCE",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_GLOBALIZATION",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "ECOMMERCE_TRADEROUTEPRODUCTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_TRADE_ROUTE_YIELD",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "2"
    }
   },
   {
    "id": "ECOMMERCE_TRADEROUTEGOLD",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_TRADE_ROUTE_YIELD",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "5"
    }
   }
  ]
 },
 {
  "type": "POLICY_INTERNATIONAL_SPACE_AGENCY",
  "slot": "SLOT_DIPLOMATIC",
  "civic": "CIVIC_GLOBALIZATION",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "INTERNATIONALSPACEAGENCY_SCIENCEPERTRIBUTARY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_YIELD_MODIFIER_PER_TRIBUTARY",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "5"
    }
   }
  ]
 },
 {
  "type": "POLICY_ONLINE_COMMUNITIES",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_SOCIAL_MEDIA",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "ONLINECOMMUNITIES_TOURISM",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_TOURISM_MODIFIER",
    "args": {
     "Amount": "50"
    }
   }
  ]
 },
 {
  "type": "POLICY_COLLECTIVE_ACTIVISM",
  "slot": "SLOT_DIPLOMATIC",
  "civic": "CIVIC_SOCIAL_MEDIA",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "COLLECTIVEACTIVISM_CULTUREPERTRIBUTARY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_YIELD_MODIFIER_PER_TRIBUTARY",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "Amount": "5"
    }
   }
  ]
 },
 {
  "type": "POLICY_GOV_AUTOCRACY",
  "slot": "SLOT_WILDCARD",
  "civic": null,
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "AUTOCRACY_CAPITAL",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_ALL_YIELDS_CHANGE",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_PALACE"
       }
      }
     ]
    }
   },
   {
    "id": "AUTOCRACY_TIER1",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_ALL_YIELDS_CHANGE",
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
        "BuildingType": "BUILDING_GOV_TALL"
       }
      },
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_GOV_WIDE"
       }
      },
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_GOV_CONQUEST"
       }
      }
     ]
    }
   },
   {
    "id": "AUTOCRACY_TIER2",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_ALL_YIELDS_CHANGE",
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
        "BuildingType": "BUILDING_GOV_CITYSTATES"
       }
      },
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_GOV_SPIES"
       }
      },
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_GOV_FAITH"
       }
      }
     ]
    }
   },
   {
    "id": "AUTOCRACY_TIER3",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_ALL_YIELDS_CHANGE",
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
        "BuildingType": "BUILDING_GOV_MILITARY"
       }
      },
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_GOV_CULTURE"
       }
      },
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_GOV_SCIENCE"
       }
      }
     ]
    }
   },
   {
    "id": "CONSULATE_TIER1",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_ALL_YIELDS_CHANGE",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_CONSULATE"
       }
      }
     ]
    }
   },
   {
    "id": "CHANCERY_TIER2",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_ALL_YIELDS_CHANGE",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_CHANCERY"
       }
      }
     ]
    }
   },
   {
    "id": "CONSULATE_TIER1",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_ALL_YIELDS_CHANGE",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_CONSULATE"
       }
      }
     ]
    }
   },
   {
    "id": "CHANCERY_TIER2",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_ALL_YIELDS_CHANGE",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_CHANCERY"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "POLICY_GOV_OLIGARCHY",
  "slot": "SLOT_WILDCARD",
  "civic": null,
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "OLIGARCHY_LEGACY_MELEE",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_OLIGARCHY_LEGACY_MELEE_BUFF"
    },
    "ability": [
     {
      "id": "OLIGARCHY_LEGACY_MELEE_BUFF",
      "collection": "COLLECTION_UNIT_COMBAT",
      "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
      "args": {
       "Amount": "4"
      }
     }
    ]
   }
  ]
 },
 {
  "type": "POLICY_GOV_CLASSICAL_REPUBLIC",
  "slot": "SLOT_WILDCARD",
  "civic": null,
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "CLASSICAL_REPUBLIC_AMENITY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_POLICY_AMENITY",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_X_SPECIALTY_DISTRICTS",
       "inverse": false,
       "args": {
        "Amount": "1"
       }
      }
     ]
    }
   },
   {
    "id": "CLASSICAL_REPUBLIC_HOUSING",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_POLICY_HOUSING",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_X_SPECIALTY_DISTRICTS",
       "inverse": false,
       "args": {
        "Amount": "1"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "POLICY_GOV_MONARCHY",
  "slot": "SLOT_WILDCARD",
  "civic": null,
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "MONARCHY_WALLS_HOUSING",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_POLICY_HOUSING",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_WALLS"
       }
      }
     ]
    }
   },
   {
    "id": "MONARCHY_CASTLE_HOUSING",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_POLICY_HOUSING",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_CASTLE"
       }
      }
     ]
    }
   },
   {
    "id": "MONARCHY_STARFORT_HOUSING",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_POLICY_HOUSING",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_STAR_FORT"
       }
      }
     ]
    }
   },
   {
    "id": "MONARCHY_STARFORT_FAVOR",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_PLAYER_EXTRA_FAVOR_PER_TURN",
    "args": {
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_STAR_FORT"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "POLICY_GOV_THEOCRACY",
  "slot": "SLOT_WILDCARD",
  "civic": null,
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "THEOCRACY_LEGACY_RELIGIOUS",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_THEOCRACY_LEGACY_RELIGIOUS_BUFF"
    },
    "ability": [
     {
      "id": "THEOCRACY_LEGACY_RELIGIOUS_BUFF",
      "collection": "COLLECTION_UNIT_COMBAT",
      "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
      "args": {
       "Amount": "5"
      }
     }
    ]
   },
   {
    "id": "THEOCRACY_RELIGIOUS_PEOPLE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_PER_POPULATION",
    "args": {
     "Amount": ".5",
     "YieldType": "YIELD_FAITH"
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
  "type": "POLICY_GOV_MERCHANT_REPUBLIC",
  "slot": "SLOT_WILDCARD",
  "civic": null,
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "MERCHANT_REPUBLIC_GOLD_MODIFIER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "10"
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
  "type": "POLICY_GOV_FASCISM",
  "slot": "SLOT_WILDCARD",
  "civic": null,
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "FASCISM_LEGACY_ATTACK",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_FASCISM_LEGACY_ATTACK_BUFF"
    },
    "ability": [
     {
      "id": "FASCISM_LEGACY_ATTACK_BUFF",
      "collection": "COLLECTION_UNIT_COMBAT",
      "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
      "args": {
       "Amount": "5"
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
     }
    ]
   },
   {
    "id": "FASCISM_WAR_WEARINESS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_WAR_WEARINESS",
    "args": {
     "Amount": "20",
     "Overall": "true"
    }
   }
  ]
 },
 {
  "type": "POLICY_GOV_COMMUNISM",
  "slot": "SLOT_WILDCARD",
  "civic": null,
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "COMMUNISM_PRODUCTIVE_PEOPLE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_PER_POPULATION",
    "args": {
     "Amount": ".6",
     "YieldType": "YIELD_PRODUCTION"
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
  "type": "POLICY_GOV_DEMOCRACY",
  "slot": "SLOT_WILDCARD",
  "civic": null,
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "DEMOCRACY_TRADEROUTEFOODTOALLY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_DESTINATION_YIELD_FOR_ALLY_ROUTE",
    "args": {
     "YieldType": "YIELD_FOOD",
     "Amount": "4"
    }
   },
   {
    "id": "DEMOCRACY_TRADEROUTEPRODUCTIONTOALLY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_DESTINATION_YIELD_FOR_ALLY_ROUTE",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "4"
    }
   },
   {
    "id": "DEMOCRACY_TRADEROUTEFOODFROMALLY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_ORIGIN_YIELD_FOR_ALLY_ROUTE",
    "args": {
     "YieldType": "YIELD_FOOD",
     "Amount": "4"
    }
   },
   {
    "id": "DEMOCRACY_TRADEROUTEPRODUCTIONFROMALLY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_ORIGIN_YIELD_FOR_ALLY_ROUTE",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "4"
    }
   },
   {
    "id": "DEMOCRACY_TRADEROUTEFOODTOSUZERAIN",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_DESTINATION_YIELD_FOR_SUZERAIN_ROUTE",
    "args": {
     "YieldType": "YIELD_FOOD",
     "Amount": "4"
    }
   },
   {
    "id": "DEMOCRACY_TRADEROUTEPRODUCTIONTOSUZERAIN",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_DESTINATION_YIELD_FOR_SUZERAIN_ROUTE",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "4"
    }
   },
   {
    "id": "DEMOCRACY_TRADEROUTEFOODFROMSUZERAIN",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_ORIGIN_YIELD_FOR_SUZERAIN_ROUTE",
    "args": {
     "YieldType": "YIELD_FOOD",
     "Amount": "4"
    }
   },
   {
    "id": "DEMOCRACY_TRADEROUTEPRODUCTIONFROMSUZERAIN",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_ORIGIN_YIELD_FOR_SUZERAIN_ROUTE",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "4"
    }
   },
   {
    "id": "DEMOCRACY_ALLIANCEPOINTS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_ALLIANCE_POINTS_FOR_MODIFIER",
    "args": {
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "POLICY_LIMITANEI",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_EARLY_EMPIRE",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "LIMITANEI_GARRISONIDENTITY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_IDENTITY_PER_TURN",
    "args": {
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_GARRISON_UNIT",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "POLICY_PRAETORIUM",
  "slot": "SLOT_DIPLOMATIC",
  "civic": "CIVIC_RECORDED_HISTORY",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_COMMUNICATIONS_OFFICE",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "PRAETORIUM_GOVERNORIDENTITY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_IDENTITY_PER_TURN",
    "args": {
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_GOVERNOR",
       "inverse": false,
       "args": {
        "Established": "false"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "POLICY_CIVIL_PRESTIGE",
  "slot": "SLOT_ECONOMIC",
  "civic": "CIVIC_CIVIL_SERVICE",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "CIVILPRESTIGE_GOVAMENITY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_POLICY_AMENITY",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_GOVERNOR_WITH_X_TITLES",
       "inverse": false,
       "args": {
        "Established": "true",
        "Amount": "2"
       }
      }
     ]
    }
   },
   {
    "id": "CIVILPRESTIGE_GOVHOUSING",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_POLICY_HOUSING",
    "args": {
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_GOVERNOR_WITH_X_TITLES",
       "inverse": false,
       "args": {
        "Established": "true",
        "Amount": "2"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "POLICY_WISSELBANKEN",
  "slot": "SLOT_DIPLOMATIC",
  "civic": "CIVIC_DIPLOMATIC_SERVICE",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "WISSELBANKEN_TRADEROUTEFOODTOALLY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_DESTINATION_YIELD_FOR_ALLY_ROUTE",
    "args": {
     "YieldType": "YIELD_FOOD",
     "Amount": "2"
    }
   },
   {
    "id": "WISSELBANKEN_TRADEROUTEFOODTOSUZERAIN",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_DESTINATION_YIELD_FOR_SUZERAIN_ROUTE",
    "args": {
     "YieldType": "YIELD_FOOD",
     "Amount": "2"
    }
   },
   {
    "id": "WISSELBANKEN_TRADEROUTEPRODUCTIONTOALLY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_DESTINATION_YIELD_FOR_ALLY_ROUTE",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "2"
    }
   },
   {
    "id": "WISSELBANKEN_TRADEROUTEFOODFROMALLY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_ORIGIN_YIELD_FOR_ALLY_ROUTE",
    "args": {
     "YieldType": "YIELD_FOOD",
     "Amount": "2"
    }
   },
   {
    "id": "WISSELBANKEN_TRADEROUTEPRODUCTIONFROMALLY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_ORIGIN_YIELD_FOR_ALLY_ROUTE",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "2"
    }
   },
   {
    "id": "WISSELBANKEN_TRADEROUTEPRODUCTIONTOSUZERAIN",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_DESTINATION_YIELD_FOR_SUZERAIN_ROUTE",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "2"
    }
   },
   {
    "id": "WISSELBANKEN_TRADEROUTEFOODFROMSUZERAIN",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_ORIGIN_YIELD_FOR_SUZERAIN_ROUTE",
    "args": {
     "YieldType": "YIELD_FOOD",
     "Amount": "2"
    }
   },
   {
    "id": "WISSELBANKEN_TRADEROUTEPRODUCTIONFROMSUZERAIN",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_ORIGIN_YIELD_FOR_SUZERAIN_ROUTE",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "2"
    }
   },
   {
    "id": "WISSELBANKEN_ALLIANCEPOINTS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_ALLIANCE_POINTS_FOR_MODIFIER",
    "args": {
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "POLICY_SECOND_STRIKE_CAPABILITY",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_COLD_WAR",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "SECONDSTRIKE_MAINTENANCEWMDS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_WMD_MAINTENANCE_MODIFIER",
    "args": {
     "Amount": "50"
    }
   }
  ]
 },
 {
  "type": "POLICY_AFTER_ACTION_REPORTS",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_RAPID_DEPLOYMENT",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "AFTERACTIONREPORTS_EXPERIENCE",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_ADJUST_UNIT_EXPERIENCE_MODIFIER",
    "args": {
     "Amount": "50"
    }
   }
  ]
 },
 {
  "type": "POLICY_COMMUNICATIONS_OFFICE",
  "slot": "SLOT_DIPLOMATIC",
  "civic": "CIVIC_SOCIAL_MEDIA",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "COMMUNICATIONS_OFFICE_GOVERNOR_IDENTITY_PER_TITLE",
    "collection": "COLLECTION_PLAYER_GOVERNORS",
    "effect": "EFFECT_GOVERNOR_ADJUST_IDENITITY_PER_TITLE",
    "args": {
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "POLICY_MONASTICISM",
  "slot": "SLOT_WILDCARD",
  "civic": null,
  "darkAge": true,
  "goldenAge": false,
  "minEra": 1,
  "maxEra": 2,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "MONASTICISM_HOLYSITE_SCIENCE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "75"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_DISTRICT",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_HOLY_SITE"
       }
      }
     ]
    }
   },
   {
    "id": "MONASTICISM_CULTURE_MODIFIER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "Amount": "-25"
    }
   }
  ]
 },
 {
  "type": "POLICY_TWILIGHT_VALOR",
  "slot": "SLOT_WILDCARD",
  "civic": null,
  "darkAge": true,
  "goldenAge": false,
  "minEra": 1,
  "maxEra": 3,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "TWILIGHTVALOR_NO_FOREIGN_HEAL",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_DISABLE_HEALING",
    "args": {
     "Disable": "true",
     "Foreign": "true"
    }
   },
   {
    "id": "TWILIGHTVALOR_NO_NEUTRAL_HEAL",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_DISABLE_HEALING",
    "args": {
     "Disable": "true",
     "Foreign": "false"
    }
   },
   {
    "id": "TWILIGHTVALOR_MELEE_ATTACK_BONUS",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_TWILIGHT_VALOR_ATTACK_BONUS"
    },
    "ability": [
     {
      "id": "TWILIGHT_VALOR_ATTACK_BONUS",
      "collection": "COLLECTION_UNIT_COMBAT",
      "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
      "args": {
       "Amount": "5"
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
     }
    ]
   }
  ]
 },
 {
  "type": "POLICY_INQUISITION",
  "slot": "SLOT_WILDCARD",
  "civic": null,
  "darkAge": true,
  "goldenAge": false,
  "minEra": 1,
  "maxEra": 3,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "INQUISITION_REDUCE_START_CHARGES",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_INQUISITION_START_CHARGES",
    "args": {
     "Amount": "1"
    }
   },
   {
    "id": "INQUISITION_FRIENDLY_TERRITORY_COMBAT",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_INQUISITION_FRIENDLY_TERRITORY_BONUS"
    },
    "ability": [
     {
      "id": "INQUISITION_FRIENDLY_TERRITORY_BONUS",
      "collection": "COLLECTION_OWNER",
      "effect": "EFFECT_ADJUST_UNIT_FRIENDLY_TERRITORY_COMBAT",
      "args": {
       "Amount": "15"
      }
     }
    ]
   },
   {
    "id": "INQUISITION_SCIENCE_MODIFIER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "-25"
    }
   }
  ]
 },
 {
  "type": "POLICY_ISOLATIONISM",
  "slot": "SLOT_WILDCARD",
  "civic": null,
  "darkAge": true,
  "goldenAge": false,
  "minEra": 1,
  "maxEra": 4,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "ISOLATIONISM_DOMESTIC_TRADE_ROUTE_FODD",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_TRADE_ROUTE_YIELD_FOR_DOMESTIC",
    "args": {
     "YieldType": "YIELD_FOOD",
     "Amount": "2",
     "Intercontinental": "false"
    }
   },
   {
    "id": "ISOLATIONISM_DOMESTIC_TRADE_ROUTE_PRODUCTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_TRADE_ROUTE_YIELD_FOR_DOMESTIC",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "2",
     "Intercontinental": "false"
    }
   },
   {
    "id": "ISOLATIONISM_DISABLE_SETTLING",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_DISABLE_SETTLING",
    "args": {
     "Disabled": "true"
    }
   },
   {
    "id": "ISOLATIONISM_DISABLE_BUILD_SETTLER",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_UNIT_BUILD_DISABLED",
    "args": {
     "UnitType": "UNIT_SETTLER"
    }
   }
  ]
 },
 {
  "type": "POLICY_LETTERS_OF_MARQUE",
  "slot": "SLOT_WILDCARD",
  "civic": null,
  "darkAge": true,
  "goldenAge": false,
  "minEra": 3,
  "maxEra": 5,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "LETTEROFMARQUE_ANCIENT_NAVAL_RAIDER_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RAIDER",
     "EraType": "ERA_ANCIENT",
     "Amount": "100"
    }
   },
   {
    "id": "LETTEROFMARQUE_CLASSICAL_NAVAL_RAIDER_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RAIDER",
     "EraType": "ERA_CLASSICAL",
     "Amount": "100"
    }
   },
   {
    "id": "LETTEROFMARQUE_MEDIEVAL_NAVAL_RAIDER_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RAIDER",
     "EraType": "ERA_MEDIEVAL",
     "Amount": "100"
    }
   },
   {
    "id": "LETTEROFMARQUE_RENAISSANCE_NAVAL_RAIDER_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RAIDER",
     "EraType": "ERA_RENAISSANCE",
     "Amount": "100"
    }
   },
   {
    "id": "LETTEROFMARQUE_INDUSTRIAL_NAVAL_RAIDER_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RAIDER",
     "EraType": "ERA_INDUSTRIAL",
     "Amount": "100"
    }
   },
   {
    "id": "LETTEROFMARQUE_MODERN_NAVAL_RAIDER_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RAIDER",
     "EraType": "ERA_MODERN",
     "Amount": "100"
    }
   },
   {
    "id": "LETTEROFMARQUE_ATOMIC_NAVAL_RAIDER_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RAIDER",
     "EraType": "ERA_ATOMIC",
     "Amount": "100"
    }
   },
   {
    "id": "LETTEROFMARQUE_INFORMATION_NAVAL_RAIDER_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION",
    "args": {
     "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RAIDER",
     "EraType": "ERA_INFORMATION",
     "Amount": "100"
    }
   },
   {
    "id": "LETTEROFMARQUE_RAIDER_MOVEMENT",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_ADJUST_UNIT_MOVEMENT",
    "args": {
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_UNIT_PROMOTION_CLASS_MATCHES",
       "inverse": false,
       "args": {
        "UnitPromotionClass": "PROMOTION_CLASS_NAVAL_RAIDER"
       }
      }
     ]
    }
   },
   {
    "id": "LETTEROFMARQUE_PLUNDER_BONUS",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_ADJUST_UNIT_PLUNDER_YIELDS",
    "args": {
     "Amount": "100"
    }
   },
   {
    "id": "LETTEROFMARQUE_TRADE_ROUTE_YIELD_DROP_DEST_CULTURE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "Amount": "-50",
     "Destination": "true"
    }
   },
   {
    "id": "LETTEROFMARQUE_TRADE_ROUTE_YIELD_DROP_DEST_FAITH",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_FAITH",
     "Amount": "-50",
     "Destination": "true"
    }
   },
   {
    "id": "LETTEROFMARQUE_TRADE_ROUTE_YIELD_DROP_DEST_FOOD",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_FOOD",
     "Amount": "-50",
     "Destination": "true"
    }
   },
   {
    "id": "LETTEROFMARQUE_TRADE_ROUTE_YIELD_DROP_DEST_GOLD",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "-50",
     "Destination": "true"
    }
   },
   {
    "id": "LETTEROFMARQUE_TRADE_ROUTE_YIELD_DROP_DEST_PRODUCTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "-50",
     "Destination": "true"
    }
   },
   {
    "id": "LETTEROFMARQUE_TRADE_ROUTE_YIELD_DROP_DEST_SCIENCE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "-50",
     "Destination": "true"
    }
   },
   {
    "id": "LETTEROFMARQUE_TRADE_ROUTE_YIELD_DROP_ORIG_CULTURE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "Amount": "-50",
     "Origin": "true"
    }
   },
   {
    "id": "LETTEROFMARQUE_TRADE_ROUTE_YIELD_DROP_ORIG_FAITH",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_FAITH",
     "Amount": "-50",
     "Origin": "true"
    }
   },
   {
    "id": "LETTEROFMARQUE_TRADE_ROUTE_YIELD_DROP_ORIG_FOOD",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_FOOD",
     "Amount": "-50",
     "Origin": "true"
    }
   },
   {
    "id": "LETTEROFMARQUE_TRADE_ROUTE_YIELD_DROP_ORIG_GOLD",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "-50",
     "Origin": "true"
    }
   },
   {
    "id": "LETTEROFMARQUE_TRADE_ROUTE_YIELD_DROP_ORIG_PRODUCTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "-50",
     "Origin": "true"
    }
   },
   {
    "id": "LETTEROFMARQUE_TRADE_ROUTE_YIELD_DROP_ORIG_SCIENCE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "-50",
     "Origin": "true"
    }
   }
  ]
 },
 {
  "type": "POLICY_ROBBER_BARONS",
  "slot": "SLOT_WILDCARD",
  "civic": null,
  "darkAge": true,
  "goldenAge": false,
  "minEra": 4,
  "maxEra": 6,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "ROBBERBARONS_FACTORY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "25"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_FACTORY"
       }
      }
     ]
    }
   },
   {
    "id": "ROBBERBARONS_STOCKEXCHANGE_GOLD",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "50"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_STOCK_EXCHANGE"
       }
      }
     ]
    }
   },
   {
    "id": "ROBBERBARONS_AMENITIES_LOST",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_POLICY_AMENITY",
    "args": {
     "Amount": "-2"
    }
   }
  ]
 },
 {
  "type": "POLICY_ELITE_FORCES",
  "slot": "SLOT_WILDCARD",
  "civic": null,
  "darkAge": true,
  "goldenAge": false,
  "minEra": 4,
  "maxEra": 8,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "ELITEFORCES_EXPERIENCE_BOOST",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_ADJUST_UNIT_EXPERIENCE_MODIFIER",
    "args": {
     "Amount": "100"
    }
   },
   {
    "id": "ELITEFORCES_EXTRA_MAINTENANCE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_UNIT_MAINTENANCE_DISCOUNT",
    "args": {
     "Amount": "-2"
    }
   }
  ]
 },
 {
  "type": "POLICY_COLLECTIVISM",
  "slot": "SLOT_WILDCARD",
  "civic": null,
  "darkAge": true,
  "goldenAge": false,
  "minEra": 5,
  "maxEra": 6,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "COLLECTIVISM_FARM_FOOD",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "COLLECTIVISM_FARM_FOOD_MODIFIER"
    },
    "attach": {
     "id": "COLLECTIVISM_FARM_FOOD_MODIFIER",
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
        "type": "REQUIREMENT_PLOT_IMPROVEMENT_TYPE_MATCHES",
        "inverse": false,
        "args": {
         "ImprovementType": "IMPROVEMENT_FARM"
        }
       }
      ]
     }
    }
   },
   {
    "id": "COLLECTIVISM_ADD_HOUSING",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_POLICY_HOUSING",
    "args": {
     "Amount": "2"
    }
   },
   {
    "id": "COLLECTIVISM_INDUSTRIAL_ADJACENCY",
    "collection": "COLLECTION_PLAYER_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "100"
    }
   },
   {
    "id": "COLLECTIVISM_REDUCE_GPP_RATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_GREAT_PERSON_POINTS_MODIFIER",
    "args": {
     "Amount": "-50"
    }
   }
  ]
 },
 {
  "type": "POLICY_ROGUE_STATE",
  "slot": "SLOT_WILDCARD",
  "civic": null,
  "darkAge": true,
  "goldenAge": false,
  "minEra": 6,
  "maxEra": 8,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "ROGUESTATE_MANHATTANPROJECT_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_PROJECT_PRODUCTION",
    "args": {
     "ProjectType": "PROJECT_MANHATTAN_PROJECT",
     "Amount": "50"
    }
   },
   {
    "id": "ROGUESTATE_PROJECTIVY_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_PROJECT_PRODUCTION",
    "args": {
     "ProjectType": "PROJECT_OPERATION_IVY",
     "Amount": "50"
    }
   },
   {
    "id": "ROGUESTATE_NUCLEARDEVICE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_PROJECT_PRODUCTION",
    "args": {
     "ProjectType": "PROJECT_BUILD_NUCLEAR_DEVICE",
     "Amount": "50"
    }
   },
   {
    "id": "ROGUESTATE_THERMONUCLEARDEVICE_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_PROJECT_PRODUCTION",
    "args": {
     "ProjectType": "PROJECT_BUILD_THERMONUCLEAR_DEVICE",
     "Amount": "50"
    }
   },
   {
    "id": "ROGUESTATE_DISABLE_INFLUENCE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_DISABLE_INFLUENCE",
    "args": {
     "Disable": "true"
    }
   }
  ]
 },
 {
  "type": "POLICY_FUTURE_VICTORY_SCIENCE",
  "slot": "SLOT_WILDCARD",
  "civic": "CIVIC_EXODUS_IMPERATIVE",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "FUTURE_VICTORY_SCIENCE_SPACEPORT_POWER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "FUTURE_VICTORY_SCIENCE_SPACEPORT_POWER_IN_CITY"
    },
    "attach": {
     "id": "FUTURE_VICTORY_SCIENCE_SPACEPORT_POWER_IN_CITY",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADJUST_CITY_FREE_POWER",
     "args": {
      "Amount": "3",
      "SourceType": "FREE_POWER_SOURCE_MISC"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_DISTRICT",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_SPACEPORT"
       }
      }
     ]
    }
   },
   {
    "id": "FUTURE_VICTORY_SCIENCE_SPACEPORT_ALUMINUM",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "FUTURE_VICTORY_SCIENCE_SPACEPORT_ALUMINUM_IN_CITY"
    },
    "attach": {
     "id": "FUTURE_VICTORY_SCIENCE_SPACEPORT_ALUMINUM_IN_CITY",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_GRANT_FREE_RESOURCE_EXTRACTED",
     "args": {
      "Amount": "3",
      "ResourceType": "RESOURCE_ALUMINUM"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_DISTRICT",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_SPACEPORT"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "POLICY_FUTURE_COUNTER_CULTURE",
  "slot": "SLOT_WILDCARD",
  "civic": "CIVIC_EXODUS_IMPERATIVE",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "FUTURE_COUNTER_CULTURE_TOURISM_REDUCTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_OVERALL_TOURISM_REDUCTION",
    "args": {
     "Modifier": "20"
    }
   }
  ]
 },
 {
  "type": "POLICY_FUTURE_VICTORY_CULTURE",
  "slot": "SLOT_WILDCARD",
  "civic": "CIVIC_CULTURAL_HEGEMONY",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "FUTURE_VICTORY_CULTURE_ROCK_BAND_PROMOTIONS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GRANT_UNIT_TYPE_UNLIMITED_PROMOTION_CHOICES",
    "args": {
     "UnitType": "UNIT_ROCK_BAND"
    }
   }
  ]
 },
 {
  "type": "POLICY_FUTURE_COUNTER_SCIENCE",
  "slot": "SLOT_WILDCARD",
  "civic": "CIVIC_CULTURAL_HEGEMONY",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "FUTURE_COUNTER_SCIENCE_SPY_PROMOTIONS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GRANT_UNIT_TYPE_UNLIMITED_PROMOTION_CHOICES",
    "args": {
     "UnitType": "UNIT_SPY"
    }
   }
  ]
 },
 {
  "type": "POLICY_FUTURE_VICTORY_DOMINATION",
  "slot": "SLOT_WILDCARD",
  "civic": "CIVIC_INFORMATION_WARFARE",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "FUTURE_VICTORY_DOMINATION_GDR_PRODUCTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_UNIT_PRODUCTION",
    "args": {
     "UnitType": "UNIT_GIANT_DEATH_ROBOT",
     "Amount": "50"
    }
   },
   {
    "id": "FUTURE_VICTORY_DOMINATION_ENEMY_TERRITORY_MOVEMENT",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_ADJUST_UNIT_ENEMY_TERRITORY_START_MOVEMENT",
    "args": {
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "POLICY_FUTURE_COUNTER_DIPLOMATIC",
  "slot": "SLOT_WILDCARD",
  "civic": "CIVIC_INFORMATION_WARFARE",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "FUTURE_COUNTER_DIPLOMATIC_REFUND_VP_RESOLUTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_FAVOR_REFUND_FOR_SUCCESSFUL_RESOLUTION",
    "args": {
     "ResolutionType": "WC_RES_DIPLOVICTORY",
     "WhichEffect": "2",
     "Percent": "50"
    }
   },
   {
    "id": "FUTURE_COUNTER_DIPLOMATIC_FAVOR_PER_TURN",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_EXTRA_FAVOR_PER_TURN",
    "args": {
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "POLICY_FUTURE_VICTORY_DIPLOMATIC",
  "slot": "SLOT_WILDCARD",
  "civic": "CIVIC_SMART_POWER_DOCTRINE",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "FUTURE_VICTORY_DIPLOMATIC_FAVOR_PER_TURN",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_EXTRA_FAVOR_PER_TURN",
    "args": {
     "Amount": "4"
    }
   }
  ]
 },
 {
  "type": "POLICY_FUTURE_COUNTER_DOMINATION",
  "slot": "SLOT_WILDCARD",
  "civic": "CIVIC_SMART_POWER_DOCTRINE",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "FUTURE_COUNTER_DOMINATION_FRIENDLY_TERRITORY_STRENGTH",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_GLOBAL_COALITION_FRIENDLY_TERRITORY"
    },
    "ability": [
     {
      "id": "GLOBAL_COALITION_FRIENDLY_TERRITORY",
      "collection": "COLLECTION_UNIT_COMBAT",
      "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
      "args": {
       "Amount": "7"
      },
      "subjectReqs": {
       "test": "ALL",
       "reqs": [
        {
         "type": "REQUIREMENT_PLOT_ADJACENT_FRIENDLY_TERRITORY",
         "inverse": false,
         "args": {
          "MinRange": "0",
          "MaxRange": "0"
         }
        }
       ]
      }
     }
    ]
   }
  ]
 },
 {
  "type": "POLICY_EQUESTRIAN_ORDERS",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_MILITARY_TRAINING",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "EQUESTRIAN_ORDERS_ADDITIONAL_HORSES_EXTRACTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_RESOURCE_ACCUMULATION_MODIFIER",
    "args": {
     "Amount": "1",
     "ResourceType": "RESOURCE_HORSES"
    }
   },
   {
    "id": "EQUESTRIAN_ORDERS_ADDITIONAL_IRON_EXTRACTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_RESOURCE_ACCUMULATION_MODIFIER",
    "args": {
     "Amount": "1",
     "ResourceType": "RESOURCE_IRON"
    }
   }
  ]
 },
 {
  "type": "POLICY_DRILL_MANUALS",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_MERCANTILISM",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "DRILL_MANUALS_ADDITIONAL_NITER_EXTRACTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_RESOURCE_ACCUMULATION_MODIFIER",
    "args": {
     "Amount": "1",
     "ResourceType": "RESOURCE_NITER"
    }
   },
   {
    "id": "DRILL_MANUALS_ADDITIONAL_COAL_EXTRACTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_RESOURCE_ACCUMULATION_MODIFIER",
    "args": {
     "Amount": "1",
     "ResourceType": "RESOURCE_COAL"
    }
   }
  ]
 },
 {
  "type": "POLICY_RETINUES",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_MERCENARIES",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [
   {
    "policy": "POLICY_FORCE_MODERNIZATION",
    "gpClass": null
   }
  ],
  "modifiers": [
   {
    "id": "PROFESSIONAL_ARMY_UPGRADE_RESOURCE_DISCOUNT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_UNIT_UPGRADE_RESOURCE_COST_DISCOUNT",
    "args": {
     "Amount": "50"
    }
   }
  ]
 },
 {
  "type": "POLICY_FORCE_MODERNIZATION",
  "slot": "SLOT_MILITARY",
  "civic": "CIVIC_URBANIZATION",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "PROFESSIONAL_ARMY_UPGRADE_RESOURCE_DISCOUNT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_UNIT_UPGRADE_RESOURCE_COST_DISCOUNT",
    "args": {
     "Amount": "50"
    }
   },
   {
    "id": "PROFESSIONAL_ARMY_UNITUPGRADEDISCOUNT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_UNIT_UPGRADE_DISCOUNT_PERCENT",
    "args": {
     "Amount": "50"
    }
   }
  ]
 },
 {
  "type": "POLICY_MUSIC_CENSORSHIP",
  "slot": "SLOT_DIPLOMATIC",
  "civic": "CIVIC_SPACE_RACE",
  "darkAge": false,
  "goldenAge": false,
  "minEra": -1,
  "maxEra": -1,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "MUSIC_CENSORSHIP_BLOCK_ROCK_BAND_ENTRY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_BLOCK_UNIT_ENTRY",
    "args": {
     "UnitType": "UNIT_ROCK_BAND"
    }
   },
   {
    "id": "MUSIC_CENSORSHIP_AMENITY_LOSS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_POLICY_AMENITY",
    "args": {
     "Amount": "-1"
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
   }
  ]
 },
 {
  "type": "POLICY_FLOWER_POWER",
  "slot": "SLOT_WILDCARD",
  "civic": null,
  "darkAge": true,
  "goldenAge": false,
  "minEra": 6,
  "maxEra": 8,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "FLOWER_POWER_ROCKBAND_DISCOUNT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_UNIT_PURCHASE_COST",
    "args": {
     "UnitType": "UNIT_ROCK_BAND",
     "Amount": "100"
    }
   },
   {
    "id": "FLOWER_POWER_PURCHASE_INCREASE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_ALL_UNITS_PURCHASE_COST",
    "args": {
     "Amount": "-100",
     "IncludeCivilian": "true",
     "UnitDomain": "DOMAIN_ALL"
    }
   },
   {
    "id": "FLOWER_POWER_PRODUCTION_INCREASE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_ALL_UNIT_PRODUCTION_MODIFIER",
    "args": {
     "Amount": "-100"
    }
   },
   {
    "id": "FLOWER_POWER_TOURISM_BOMB_CONCERT_VALUE",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_ADJUST_UNIT_ROCK_BAND_TOURISM_BOMB_VALUE_PEACE",
    "args": {
     "Amount": "50"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_UNIT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "UnitType": "UNIT_ROCK_BAND"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "POLICY_CYBER_WARFARE",
  "slot": "SLOT_WILDCARD",
  "civic": null,
  "darkAge": true,
  "goldenAge": false,
  "minEra": 7,
  "maxEra": 8,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "CYBER_WARFARE_COMBAT_BONUS",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_CYBER_WARFARE_COMBAT_BONUS"
    },
    "ability": [
     {
      "id": "CYBER_WARFARE_INFO_FUTURE_BUFF",
      "collection": "COLLECTION_UNIT_COMBAT",
      "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
      "args": {
       "Amount": "10"
      },
      "subjectReqs": {
       "test": "ALL",
       "reqs": [
        {
         "type": "REQUIREMENT_OPPONENT_ERA_AT_LEAST",
         "inverse": false,
         "args": {
          "MinimumEraType": "ERA_INFORMATION"
         }
        }
       ]
      }
     }
    ]
   },
   {
    "id": "CYBER_WARFARE_DISABLE_GRIEVANCE_DECAY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_DISABLE_PLAYER_GRIEVANCE_DECAY",
    "args": {
     "Disable": "true"
    }
   }
  ]
 },
 {
  "type": "POLICY_AUTOMATED_WORKFORCE",
  "slot": "SLOT_WILDCARD",
  "civic": null,
  "darkAge": true,
  "goldenAge": false,
  "minEra": 7,
  "maxEra": 8,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "AUTOMATED_WORKFORCE_PROJECT_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_ALL_PROJECTS_PRODUCTION",
    "args": {
     "Amount": "20"
    }
   },
   {
    "id": "AUTOMATED_WORKFORCE_AMENITY_LOSS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_POLICY_AMENITY",
    "args": {
     "Amount": "-1"
    }
   },
   {
    "id": "AUTOMATED_WORKFORCE_LOYALTY_LOSS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_IDENTITY_PER_TURN",
    "args": {
     "Amount": "-5"
    }
   }
  ]
 },
 {
  "type": "POLICY_DISINFORMATION_CAMPAIGN",
  "slot": "SLOT_WILDCARD",
  "civic": null,
  "darkAge": true,
  "goldenAge": false,
  "minEra": 7,
  "maxEra": 8,
  "government": null,
  "obsolete": [],
  "modifiers": [
   {
    "id": "DISINFORMATION_CAMPAIGN_BROADCAST_FAVOR",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_BUILDING_FAVOR",
    "args": {
     "BuildingType": "BUILDING_BROADCAST_CENTER",
     "Favor": "3"
    }
   },
   {
    "id": "DISINFORMATION_CAMPAIGN_SCIENCE_REDUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "-10"
    }
   },
   {
    "id": "DISINFORMATION_CAMPAIGN_CULTURE_REDUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "Amount": "-10"
    }
   }
  ]
 }
];
export const AI_GOVERNMENTS: readonly AiGovernment[] = [
 {
  "type": "GOVERNMENT_CHIEFDOM",
  "civic": null,
  "slots": [
   {
    "slot": "SLOT_MILITARY",
    "n": 1
   },
   {
    "slot": "SLOT_ECONOMIC",
    "n": 1
   }
  ],
  "favor": 0,
  "influenceThreshold": 100,
  "modifiers": []
 },
 {
  "type": "GOVERNMENT_AUTOCRACY",
  "civic": "CIVIC_POLITICAL_PHILOSOPHY",
  "slots": [
   {
    "slot": "SLOT_MILITARY",
    "n": 1
   },
   {
    "slot": "SLOT_ECONOMIC",
    "n": 1
   },
   {
    "slot": "SLOT_DIPLOMATIC",
    "n": 1
   },
   {
    "slot": "SLOT_WILDCARD",
    "n": 1
   }
  ],
  "favor": 1,
  "influenceThreshold": 100,
  "modifiers": [
   {
    "id": "AUTOCRACY_CAPITAL",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_ALL_YIELDS_CHANGE",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_PALACE"
       }
      }
     ]
    }
   },
   {
    "id": "AUTOCRACY_TIER1",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_ALL_YIELDS_CHANGE",
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
        "BuildingType": "BUILDING_GOV_TALL"
       }
      },
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_GOV_WIDE"
       }
      },
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_GOV_CONQUEST"
       }
      }
     ]
    }
   },
   {
    "id": "AUTOCRACY_TIER2",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_ALL_YIELDS_CHANGE",
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
        "BuildingType": "BUILDING_GOV_CITYSTATES"
       }
      },
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_GOV_SPIES"
       }
      },
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_GOV_FAITH"
       }
      }
     ]
    }
   },
   {
    "id": "AUTOCRACY_TIER3",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_ALL_YIELDS_CHANGE",
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
        "BuildingType": "BUILDING_GOV_MILITARY"
       }
      },
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_GOV_CULTURE"
       }
      },
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_GOV_SCIENCE"
       }
      }
     ]
    }
   },
   {
    "id": "AUTOCRACY_WONDERS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_FLAT_BONUS",
    "args": {
     "BonusType": "GOVERNMENTBONUS_WONDER_CONSTRUCTION",
     "Amount": "10"
    }
   },
   {
    "id": "CONSULATE_TIER1",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_ALL_YIELDS_CHANGE",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_CONSULATE"
       }
      }
     ]
    }
   },
   {
    "id": "CHANCERY_TIER2",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_ALL_YIELDS_CHANGE",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_CHANCERY"
       }
      }
     ]
    }
   },
   {
    "id": "CONSULATE_TIER1",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_ALL_YIELDS_CHANGE",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_CONSULATE"
       }
      }
     ]
    }
   },
   {
    "id": "CHANCERY_TIER2",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_ALL_YIELDS_CHANGE",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_CHANCERY"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "GOVERNMENT_OLIGARCHY",
  "civic": "CIVIC_POLITICAL_PHILOSOPHY",
  "slots": [
   {
    "slot": "SLOT_MILITARY",
    "n": 2
   },
   {
    "slot": "SLOT_ECONOMIC",
    "n": 1
   },
   {
    "slot": "SLOT_WILDCARD",
    "n": 1
   }
  ],
  "favor": 1,
  "influenceThreshold": 100,
  "modifiers": [
   {
    "id": "OLIGARCHY_MELEE",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_OLIGARCHY_MELEE_BUFF"
    },
    "ability": [
     {
      "id": "OLIGARCHY_MELEE_BUFF",
      "collection": "COLLECTION_UNIT_COMBAT",
      "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
      "args": {
       "Amount": "4"
      }
     }
    ]
   },
   {
    "id": "OLIGARCHY_UNIT_EXPERIENCE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_FLAT_BONUS",
    "args": {
     "BonusType": "GOVERNMENTBONUS_COMBAT_EXPERIENCE",
     "Amount": "20"
    }
   }
  ]
 },
 {
  "type": "GOVERNMENT_CLASSICAL_REPUBLIC",
  "civic": "CIVIC_POLITICAL_PHILOSOPHY",
  "slots": [
   {
    "slot": "SLOT_ECONOMIC",
    "n": 2
   },
   {
    "slot": "SLOT_DIPLOMATIC",
    "n": 1
   },
   {
    "slot": "SLOT_WILDCARD",
    "n": 1
   }
  ],
  "favor": 1,
  "influenceThreshold": 100,
  "modifiers": [
   {
    "id": "CLASSICAL_REPUBLIC_AMENITY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_POLICY_AMENITY",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_X_SPECIALTY_DISTRICTS",
       "inverse": false,
       "args": {
        "Amount": "1"
       }
      }
     ]
    }
   },
   {
    "id": "CLASSICAL_REPUBLIC_HOUSING",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_POLICY_HOUSING",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_X_SPECIALTY_DISTRICTS",
       "inverse": false,
       "args": {
        "Amount": "1"
       }
      }
     ]
    }
   },
   {
    "id": "CLASSICAL_REPUBLIC_GREAT_PEOPLE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_FLAT_BONUS",
    "args": {
     "BonusType": "GOVERNMENTBONUS_GREAT_PEOPLE",
     "Amount": "15"
    }
   }
  ]
 },
 {
  "type": "GOVERNMENT_MONARCHY",
  "civic": "CIVIC_DIVINE_RIGHT",
  "slots": [
   {
    "slot": "SLOT_MILITARY",
    "n": 2
   },
   {
    "slot": "SLOT_ECONOMIC",
    "n": 1
   },
   {
    "slot": "SLOT_DIPLOMATIC",
    "n": 1
   },
   {
    "slot": "SLOT_WILDCARD",
    "n": 2
   }
  ],
  "favor": 2,
  "influenceThreshold": 150,
  "modifiers": [
   {
    "id": "MONARCHY_WALLS_HOUSING",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_POLICY_HOUSING",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_WALLS"
       }
      }
     ]
    }
   },
   {
    "id": "MONARCHY_CASTLE_HOUSING",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_POLICY_HOUSING",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_CASTLE"
       }
      }
     ]
    }
   },
   {
    "id": "MONARCHY_STARFORT_HOUSING",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_POLICY_HOUSING",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_STAR_FORT"
       }
      }
     ]
    }
   },
   {
    "id": "MONARCHY_ENVOYS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_FLAT_BONUS",
    "args": {
     "BonusType": "GOVERNMENTBONUS_ENVOYS",
     "Amount": "50"
    }
   },
   {
    "id": "MONARCHY_STARFORT_FAVOR",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_PLAYER_EXTRA_FAVOR_PER_TURN",
    "args": {
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_STAR_FORT"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "GOVERNMENT_THEOCRACY",
  "civic": "CIVIC_REFORMED_CHURCH",
  "slots": [
   {
    "slot": "SLOT_MILITARY",
    "n": 2
   },
   {
    "slot": "SLOT_ECONOMIC",
    "n": 2
   },
   {
    "slot": "SLOT_DIPLOMATIC",
    "n": 1
   },
   {
    "slot": "SLOT_WILDCARD",
    "n": 1
   }
  ],
  "favor": 2,
  "influenceThreshold": 150,
  "modifiers": [
   {
    "id": "THEOCRACY_RELIGIOUS",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_THEOCRACY_RELIGIOUS_BUFF"
    },
    "ability": [
     {
      "id": "THEOCRACY_RELIGIOUS_BUFF",
      "collection": "COLLECTION_UNIT_COMBAT",
      "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
      "args": {
       "Amount": "5"
      }
     }
    ]
   },
   {
    "id": "THEOCRACY_RELIGIOUS_PEOPLE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_PER_POPULATION",
    "args": {
     "Amount": ".5",
     "YieldType": "YIELD_FAITH"
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
    "id": "THEOCRACY_FAITH_PURCHASE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_FLAT_BONUS",
    "args": {
     "BonusType": "GOVERNMENTBONUS_FAITH_PURCHASES",
     "Amount": "15"
    }
   }
  ]
 },
 {
  "type": "GOVERNMENT_MERCHANT_REPUBLIC",
  "civic": "CIVIC_EXPLORATION",
  "slots": [
   {
    "slot": "SLOT_MILITARY",
    "n": 1
   },
   {
    "slot": "SLOT_ECONOMIC",
    "n": 2
   },
   {
    "slot": "SLOT_DIPLOMATIC",
    "n": 2
   },
   {
    "slot": "SLOT_WILDCARD",
    "n": 1
   }
  ],
  "favor": 2,
  "influenceThreshold": 150,
  "modifiers": [
   {
    "id": "MERCHANT_REPUBLIC_GOLD_MODIFIER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "10"
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
    "id": "MERCHANT_REPUBLIC_DISTRICTS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_FLAT_BONUS",
    "args": {
     "BonusType": "GOVERNMENTBONUS_DISTRICT_PRODUCTION",
     "Amount": "15"
    }
   }
  ]
 },
 {
  "type": "GOVERNMENT_FASCISM",
  "civic": "CIVIC_TOTALITARIANISM",
  "slots": [
   {
    "slot": "SLOT_MILITARY",
    "n": 4
   },
   {
    "slot": "SLOT_ECONOMIC",
    "n": 1
   },
   {
    "slot": "SLOT_DIPLOMATIC",
    "n": 1
   },
   {
    "slot": "SLOT_WILDCARD",
    "n": 2
   }
  ],
  "favor": 3,
  "influenceThreshold": 200,
  "modifiers": [
   {
    "id": "FASCISM_ATTACK",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_FASCISM_ATTACK_BUFF"
    },
    "ability": [
     {
      "id": "FASCISM_ATTACK_BUFF",
      "collection": "COLLECTION_UNIT_COMBAT",
      "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
      "args": {
       "Amount": "5"
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
     }
    ]
   },
   {
    "id": "FASCISM_WAR_WEARINESS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_WAR_WEARINESS",
    "args": {
     "Amount": "20",
     "Overall": "true"
    }
   },
   {
    "id": "FASCISM_UNIT_PRODUCTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_FLAT_BONUS",
    "args": {
     "BonusType": "GOVERNMENTBONUS_UNIT_PRODUCTION",
     "Amount": "50"
    }
   }
  ]
 },
 {
  "type": "GOVERNMENT_COMMUNISM",
  "civic": "CIVIC_CLASS_STRUGGLE",
  "slots": [
   {
    "slot": "SLOT_MILITARY",
    "n": 3
   },
   {
    "slot": "SLOT_ECONOMIC",
    "n": 3
   },
   {
    "slot": "SLOT_DIPLOMATIC",
    "n": 1
   },
   {
    "slot": "SLOT_WILDCARD",
    "n": 1
   }
  ],
  "favor": 3,
  "influenceThreshold": 200,
  "modifiers": [
   {
    "id": "COMMUNISM_PRODUCTIVE_PEOPLE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_PER_POPULATION",
    "args": {
     "Amount": ".6",
     "YieldType": "YIELD_PRODUCTION"
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
    "id": "COMMUNISM_SCIENCE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "10"
    }
   }
  ]
 },
 {
  "type": "GOVERNMENT_DEMOCRACY",
  "civic": "CIVIC_SUFFRAGE",
  "slots": [
   {
    "slot": "SLOT_MILITARY",
    "n": 1
   },
   {
    "slot": "SLOT_ECONOMIC",
    "n": 3
   },
   {
    "slot": "SLOT_DIPLOMATIC",
    "n": 2
   },
   {
    "slot": "SLOT_WILDCARD",
    "n": 2
   }
  ],
  "favor": 3,
  "influenceThreshold": 200,
  "modifiers": [
   {
    "id": "DEMOCRACY_GOLD_PURCHASE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_FLAT_BONUS",
    "args": {
     "BonusType": "GOVERNMENTBONUS_GOLD_PURCHASES",
     "Amount": "15"
    }
   },
   {
    "id": "DEMOCRACY_TRADEROUTEFOODTOALLY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_DESTINATION_YIELD_FOR_ALLY_ROUTE",
    "args": {
     "YieldType": "YIELD_FOOD",
     "Amount": "4"
    }
   },
   {
    "id": "DEMOCRACY_TRADEROUTEPRODUCTIONTOALLY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_DESTINATION_YIELD_FOR_ALLY_ROUTE",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "4"
    }
   },
   {
    "id": "DEMOCRACY_TRADEROUTEFOODFROMALLY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_ORIGIN_YIELD_FOR_ALLY_ROUTE",
    "args": {
     "YieldType": "YIELD_FOOD",
     "Amount": "4"
    }
   },
   {
    "id": "DEMOCRACY_TRADEROUTEPRODUCTIONFROMALLY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_ORIGIN_YIELD_FOR_ALLY_ROUTE",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "4"
    }
   },
   {
    "id": "DEMOCRACY_TRADEROUTEFOODTOSUZERAIN",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_DESTINATION_YIELD_FOR_SUZERAIN_ROUTE",
    "args": {
     "YieldType": "YIELD_FOOD",
     "Amount": "4"
    }
   },
   {
    "id": "DEMOCRACY_TRADEROUTEPRODUCTIONTOSUZERAIN",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_DESTINATION_YIELD_FOR_SUZERAIN_ROUTE",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "4"
    }
   },
   {
    "id": "DEMOCRACY_TRADEROUTEFOODFROMSUZERAIN",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_ORIGIN_YIELD_FOR_SUZERAIN_ROUTE",
    "args": {
     "YieldType": "YIELD_FOOD",
     "Amount": "4"
    }
   },
   {
    "id": "DEMOCRACY_TRADEROUTEPRODUCTIONFROMSUZERAIN",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_ORIGIN_YIELD_FOR_SUZERAIN_ROUTE",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "4"
    }
   },
   {
    "id": "DEMOCRACY_ALLIANCEPOINTS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_ALLIANCE_POINTS_FOR_MODIFIER",
    "args": {
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "GOVERNMENT_CORPORATE_LIBERTARIANISM",
  "civic": "CIVIC_CORPORATE_LIBERTARIANISM",
  "slots": [
   {
    "slot": "SLOT_MILITARY",
    "n": 3
   },
   {
    "slot": "SLOT_ECONOMIC",
    "n": 1
   },
   {
    "slot": "SLOT_DIPLOMATIC",
    "n": 1
   },
   {
    "slot": "SLOT_WILDCARD",
    "n": 5
   }
  ],
  "favor": 4,
  "influenceThreshold": 250,
  "modifiers": [
   {
    "id": "CORPORATE_LIBERTARIANISM_RESOURCE_EXTRACTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_EXTRA_ACCUMULATION",
    "args": {
     "Amount": "1"
    }
   },
   {
    "id": "CORPORATE_LIBERTARIANISM_COMMERCIAL_HUB_PRODUCTION",
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
       "type": "REQUIREMENT_CITY_HAS_DISTRICT",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_COMMERCIAL_HUB"
       }
      }
     ]
    }
   },
   {
    "id": "CORPORATE_LIBERTARIANISM_ENCAMPMENT_PRODUCTION",
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
       "type": "REQUIREMENT_CITY_HAS_DISTRICT",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_ENCAMPMENT"
       }
      }
     ]
    }
   },
   {
    "id": "CORPORATE_LIBERTARIANISM_SCIENCE_PENALTY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "-10"
    }
   }
  ]
 },
 {
  "type": "GOVERNMENT_DIGITAL_DEMOCRACY",
  "civic": "CIVIC_DIGITAL_DEMOCRACY",
  "slots": [
   {
    "slot": "SLOT_MILITARY",
    "n": 1
   },
   {
    "slot": "SLOT_ECONOMIC",
    "n": 1
   },
   {
    "slot": "SLOT_DIPLOMATIC",
    "n": 3
   },
   {
    "slot": "SLOT_WILDCARD",
    "n": 5
   }
  ],
  "favor": 4,
  "influenceThreshold": 250,
  "modifiers": [
   {
    "id": "DIGITAL_DEMOCRACY_CITY_AMENITIES",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_POLICY_AMENITY",
    "args": {
     "Amount": "2"
    }
   },
   {
    "id": "DIGITAL_DEMOCRACY_DISTRICT_CULTURE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_PER_DISTRICT",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "Amount": "2"
    }
   },
   {
    "id": "DIGITAL_DEMOCRACY_COMBAT_STRENGTH_PENALTY",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_DIGITAL_DEMOCRACY_DEBUFF"
    },
    "ability": [
     {
      "id": "DIGITAL_DEMOCRACY_DEBUFF",
      "collection": "COLLECTION_UNIT_COMBAT",
      "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
      "args": {
       "Amount": "-3"
      }
     }
    ]
   }
  ]
 },
 {
  "type": "GOVERNMENT_SYNTHETIC_TECHNOCRACY",
  "civic": "CIVIC_SYNTHETIC_TECHNOCRACY",
  "slots": [
   {
    "slot": "SLOT_MILITARY",
    "n": 1
   },
   {
    "slot": "SLOT_ECONOMIC",
    "n": 3
   },
   {
    "slot": "SLOT_DIPLOMATIC",
    "n": 1
   },
   {
    "slot": "SLOT_WILDCARD",
    "n": 5
   }
  ],
  "favor": 4,
  "influenceThreshold": 250,
  "modifiers": [
   {
    "id": "SYNTHETIC_TECHNOCRACY_CITY_POWER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_FREE_POWER",
    "args": {
     "Amount": "3",
     "SourceType": "FREE_POWER_SOURCE_MISC"
    }
   },
   {
    "id": "SYNTHETIC_TECHNOCRACY_CITY_PROJECT_PRODUCTION",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_ALL_PROJECTS_PRODUCTION",
    "args": {
     "Amount": "30"
    }
   },
   {
    "id": "SYNTHETIC_TECHNOCRACY_TOURISM_PENALTY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TOURISM",
    "args": {
     "Amount": "-10"
    }
   }
  ]
 }
];
export const AI_SLOT_TYPES: readonly AiSlotType[] = [
 {
  "type": "SLOT_ECONOMIC",
  "any": false
 },
 {
  "type": "SLOT_MILITARY",
  "any": false
 },
 {
  "type": "SLOT_DIPLOMATIC",
  "any": false
 },
 {
  "type": "SLOT_GREAT_PERSON",
  "any": false
 },
 {
  "type": "SLOT_WILDCARD",
  "any": true
 }
];
export const AI_ERAS: readonly string[] = [
 "ERA_ANCIENT",
 "ERA_CLASSICAL",
 "ERA_MEDIEVAL",
 "ERA_RENAISSANCE",
 "ERA_INDUSTRIAL",
 "ERA_MODERN",
 "ERA_ATOMIC",
 "ERA_INFORMATION",
 "ERA_FUTURE"
];
export const AI_PLOT_EVAL_CONDITIONS: readonly string[] = [
 "Nearest Enemy City",
 "Nearest Friendly City",
 "New Resources",
 "Inner Ring Yield",
 "Total Yield",
 "Coastal",
 "Fresh Water",
 "Specific Resource",
 "Specific Feature",
 "Resource Class",
 "Foreign Continent",
 "Cultural Pressure"
];
export const AI_PLOT_EVAL_LISTS: Readonly<Record<string, readonly AiPlotEvalItem[]>> = {
 "CavalryLoverCitySettlement": [
  {
   "condition": "Specific Resource",
   "favored": true,
   "value": 12,
   "stringVal": "RESOURCE_HORSES"
  }
 ],
 "CompactEmpire": [
  {
   "condition": "Nearest Friendly City",
   "favored": false,
   "value": -5,
   "stringVal": null
  }
 ],
 "DidoCoastalSettlements": [
  {
   "condition": "Coastal",
   "favored": false,
   "value": 35,
   "stringVal": null
  }
 ],
 "ExpansionSettlementPreferences": [
  {
   "condition": "Foreign Continent",
   "favored": false,
   "value": 4,
   "stringVal": null
  },
  {
   "condition": "Nearest Friendly City",
   "favored": false,
   "value": 6,
   "stringVal": null
  }
 ],
 "JoaoCoastalSettlements": [
  {
   "condition": "Coastal",
   "favored": false,
   "value": 35,
   "stringVal": null
  }
 ],
 "LastVikingKingCoastSettlement": [
  {
   "condition": "Coastal",
   "favored": false,
   "value": 30,
   "stringVal": null
  }
 ],
 "MaoriSettlePreferences": [
  {
   "condition": "Nearest Friendly City",
   "favored": false,
   "value": 8,
   "stringVal": null
  }
 ],
 "MayanEmpire": [
  {
   "condition": "Fresh Water",
   "favored": false,
   "value": -20,
   "stringVal": null
  },
  {
   "condition": "Resource Class",
   "favored": false,
   "value": 3,
   "stringVal": "RESOURCECLASS_LUXURY"
  }
 ],
 "NavalSettlementPreferences": [
  {
   "condition": "Coastal",
   "favored": false,
   "value": 10,
   "stringVal": null
  },
  {
   "condition": "Specific Resource",
   "favored": false,
   "value": -3,
   "stringVal": "RESOURCE_HORSES"
  },
  {
   "condition": "Specific Resource",
   "favored": false,
   "value": -5,
   "stringVal": "RESOURCE_IRON"
  },
  {
   "condition": "Foreign Continent",
   "favored": true,
   "value": 4,
   "stringVal": null
  },
  {
   "condition": "Nearest Friendly City",
   "favored": false,
   "value": 4,
   "stringVal": null
  }
 ],
 "PhilipForeignSettlement": [
  {
   "condition": "Foreign Continent",
   "favored": false,
   "value": 60,
   "stringVal": null
  }
 ],
 "PreferHills": [
  {
   "condition": "Inner Ring Yield",
   "favored": false,
   "value": 1,
   "stringVal": "YIELD_PRODUCTION"
  }
 ],
 "SettleAllContinents": [
  {
   "condition": "Foreign Continent",
   "favored": true,
   "value": 120,
   "stringVal": null
  }
 ],
 "SettleOneContinent": [
  {
   "condition": "Foreign Continent",
   "favored": false,
   "value": -50,
   "stringVal": null
  }
 ],
 "StandardSettlePlot": [
  {
   "condition": "Total Yield",
   "favored": false,
   "value": 2,
   "stringVal": "YIELD_PRODUCTION"
  },
  {
   "condition": "Total Yield",
   "favored": false,
   "value": 1,
   "stringVal": "YIELD_FOOD"
  },
  {
   "condition": "Total Yield",
   "favored": false,
   "value": 1,
   "stringVal": "YIELD_SCIENCE"
  },
  {
   "condition": "Total Yield",
   "favored": false,
   "value": 1,
   "stringVal": "YIELD_CULTURE"
  },
  {
   "condition": "Total Yield",
   "favored": false,
   "value": 1,
   "stringVal": "YIELD_FAITH"
  },
  {
   "condition": "Inner Ring Yield",
   "favored": false,
   "value": 2,
   "stringVal": "YIELD_FOOD"
  },
  {
   "condition": "Inner Ring Yield",
   "favored": false,
   "value": 2,
   "stringVal": "YIELD_PRODUCTION"
  },
  {
   "condition": "Inner Ring Yield",
   "favored": false,
   "value": 1,
   "stringVal": "YIELD_SCIENCE"
  },
  {
   "condition": "Inner Ring Yield",
   "favored": false,
   "value": 1,
   "stringVal": "YIELD_CULTURE"
  },
  {
   "condition": "Inner Ring Yield",
   "favored": false,
   "value": 1,
   "stringVal": "YIELD_FAITH"
  },
  {
   "condition": "Fresh Water",
   "favored": false,
   "value": 20,
   "stringVal": null
  },
  {
   "condition": "New Resources",
   "favored": false,
   "value": 4,
   "stringVal": null
  },
  {
   "condition": "Coastal",
   "favored": false,
   "value": 12,
   "stringVal": null
  },
  {
   "condition": "Specific Resource",
   "favored": false,
   "value": 3,
   "stringVal": "RESOURCE_HORSES"
  },
  {
   "condition": "Specific Resource",
   "favored": false,
   "value": 5,
   "stringVal": "RESOURCE_IRON"
  },
  {
   "condition": "Specific Resource",
   "favored": false,
   "value": 2,
   "stringVal": "RESOURCE_NITER"
  },
  {
   "condition": "Resource Class",
   "favored": false,
   "value": 2,
   "stringVal": "RESOURCECLASS_LUXURY"
  },
  {
   "condition": "Resource Class",
   "favored": false,
   "value": 2,
   "stringVal": "RESOURCECLASS_STRATEGIC"
  },
  {
   "condition": "Specific Feature",
   "favored": false,
   "value": -3,
   "stringVal": "FEATURE_ICE"
  },
  {
   "condition": "Specific Feature",
   "favored": false,
   "value": 6,
   "stringVal": "FEATURE_DEAD_SEA"
  },
  {
   "condition": "Foreign Continent",
   "favored": true,
   "value": -2,
   "stringVal": null
  },
  {
   "condition": "Nearest Friendly City",
   "favored": false,
   "value": -10,
   "stringVal": null
  },
  {
   "condition": "Cultural Pressure",
   "favored": false,
   "value": 1,
   "stringVal": null
  },
  {
   "condition": "Cultural Pressure",
   "favored": true,
   "value": -6,
   "stringVal": null
  }
 ],
 "TucapelSettlingChanges": [
  {
   "condition": "Nearest Friendly City",
   "favored": false,
   "value": -5,
   "stringVal": null
  }
 ],
 "VietnamSettlePreferences": [
  {
   "condition": "Specific Feature",
   "favored": false,
   "value": 2,
   "stringVal": "FEATURE_FOREST"
  },
  {
   "condition": "Specific Feature",
   "favored": false,
   "value": 2,
   "stringVal": "FEATURE_JUNGLE"
  },
  {
   "condition": "Specific Feature",
   "favored": false,
   "value": 2,
   "stringVal": "FEATURE_MARSH"
  }
 ]
};
export const AI_PLOT_EVAL_BY_LEADER: Readonly<Record<string, readonly string[]>> = {
 "LEADER_DEFAULT": [
  "StandardSettlePlot"
 ],
 "LEADER_BARBAROSSA": [
  "StandardSettlePlot"
 ],
 "LEADER_CATHERINE_DE_MEDICI": [
  "StandardSettlePlot"
 ],
 "LEADER_CLEOPATRA": [
  "StandardSettlePlot"
 ],
 "LEADER_GANDHI": [
  "StandardSettlePlot"
 ],
 "LEADER_GILGAMESH": [
  "StandardSettlePlot"
 ],
 "LEADER_GORGO": [
  "StandardSettlePlot"
 ],
 "LEADER_HARDRADA": [
  "StandardSettlePlot"
 ],
 "LEADER_HOJO": [
  "StandardSettlePlot"
 ],
 "LEADER_MVEMBA": [
  "StandardSettlePlot"
 ],
 "LEADER_PEDRO": [
  "StandardSettlePlot"
 ],
 "LEADER_PERICLES": [
  "StandardSettlePlot"
 ],
 "LEADER_PETER_GREAT": [
  "StandardSettlePlot"
 ],
 "LEADER_PHILIP_II": [
  "StandardSettlePlot",
  "PhilipForeignSettlement"
 ],
 "LEADER_QIN": [
  "StandardSettlePlot"
 ],
 "LEADER_SALADIN": [
  "StandardSettlePlot"
 ],
 "LEADER_TOMYRIS": [
  "StandardSettlePlot"
 ],
 "LEADER_TRAJAN": [
  "StandardSettlePlot"
 ],
 "LEADER_T_ROOSEVELT": [
  "StandardSettlePlot"
 ],
 "LEADER_VICTORIA": [
  "StandardSettlePlot",
  "SettleAllContinents"
 ],
 "LEADER_CHANDRAGUPTA": [
  "StandardSettlePlot"
 ],
 "LEADER_GENGHIS_KHAN": [
  "StandardSettlePlot",
  "CavalryLoverCitySettlement"
 ],
 "LEADER_LAUTARO": [
  "StandardSettlePlot",
  "TucapelSettlingChanges"
 ],
 "LEADER_POUNDMAKER": [
  "StandardSettlePlot"
 ],
 "LEADER_ROBERT_THE_BRUCE": [
  "StandardSettlePlot"
 ],
 "LEADER_SEONDEOK": [
  "StandardSettlePlot"
 ],
 "LEADER_SHAKA": [
  "StandardSettlePlot"
 ],
 "LEADER_TAMAR": [
  "StandardSettlePlot"
 ],
 "LEADER_WILHELMINA": [
  "StandardSettlePlot"
 ],
 "LEADER_DIDO": [
  "StandardSettlePlot",
  "DidoCoastalSettlements"
 ],
 "LEADER_ELEANOR_ENGLAND": [
  "StandardSettlePlot"
 ],
 "LEADER_ELEANOR_FRANCE": [
  "StandardSettlePlot"
 ],
 "LEADER_KRISTINA": [
  "StandardSettlePlot"
 ],
 "LEADER_KUPE": [
  "StandardSettlePlot"
 ],
 "LEADER_LAURIER": [
  "StandardSettlePlot"
 ],
 "LEADER_MANSA_MUSA": [
  "StandardSettlePlot"
 ],
 "LEADER_MATTHIAS_CORVINUS": [
  "StandardSettlePlot"
 ],
 "LEADER_PACHACUTI": [
  "StandardSettlePlot"
 ],
 "LEADER_SULEIMAN": [
  "StandardSettlePlot"
 ],
 "LEADER_JOHN_CURTIN": [
  "StandardSettlePlot"
 ],
 "LEADER_MONTEZUMA": [
  "StandardSettlePlot"
 ],
 "LEADER_HAMMURABI": [
  "StandardSettlePlot"
 ],
 "LEADER_AMBIORIX": [
  "StandardSettlePlot"
 ],
 "LEADER_BASIL": [
  "StandardSettlePlot"
 ],
 "LEADER_CATHERINE_DE_MEDICI_ALT": [
  "StandardSettlePlot"
 ],
 "LEADER_MENELIK": [
  "StandardSettlePlot"
 ],
 "LEADER_SIMON_BOLIVAR": [
  "StandardSettlePlot"
 ],
 "LEADER_LADY_SIX_SKY": [
  "StandardSettlePlot",
  "CompactEmpire"
 ],
 "LEADER_LUDWIG": [
  "StandardSettlePlot"
 ],
 "LEADER_THEODORA": [
  "StandardSettlePlot"
 ],
 "LEADER_SEJONG": [
  "StandardSettlePlot"
 ],
 "LEADER_ABRAHAM_LINCOLN": [
  "StandardSettlePlot"
 ],
 "LEADER_NZINGA_MBANDE": [
  "StandardSettlePlot",
  "SettleOneContinent"
 ],
 "LEADER_SALADIN_ALT": [
  "StandardSettlePlot"
 ],
 "LEADER_TOKUGAWA": [
  "StandardSettlePlot"
 ],
 "LEADER_NADER_SHAH": [
  "StandardSettlePlot"
 ],
 "LEADER_SULEIMAN_ALT": [
  "StandardSettlePlot"
 ],
 "LEADER_GITARJA": [
  "StandardSettlePlot"
 ],
 "LEADER_JAYAVARMAN": [
  "StandardSettlePlot"
 ],
 "LEADER_JULIUS_CAESAR": [
  "StandardSettlePlot"
 ],
 "LEADER_KUBLAI_KHAN_CHINA": [
  "StandardSettlePlot"
 ],
 "LEADER_LADY_TRIEU": [
  "StandardSettlePlot"
 ],
 "LEADER_KUBLAI_KHAN_MONGOLIA": [
  "StandardSettlePlot"
 ],
 "LEADER_ALEXANDER": [
  "StandardSettlePlot"
 ],
 "LEADER_CYRUS": [
  "StandardSettlePlot"
 ],
 "LEADER_AMANITORE": [
  "StandardSettlePlot"
 ],
 "LEADER_JADWIGA": [
  "StandardSettlePlot"
 ],
 "LEADER_JOAO_III": [
  "StandardSettlePlot",
  "JoaoCoastalSettlements"
 ],
 "LEADER_YONGLE": [
  "StandardSettlePlot"
 ],
 "LEADER_WU_ZETIAN": [
  "StandardSettlePlot"
 ],
 "LEADER_QIN_ALT": [
  "StandardSettlePlot"
 ],
 "LEADER_ELIZABETH": [
  "StandardSettlePlot"
 ],
 "LEADER_HARALD_ALT": [
  "StandardSettlePlot"
 ],
 "LEADER_VICTORIA_ALT": [
  "StandardSettlePlot"
 ],
 "LEADER_RAMSES": [
  "StandardSettlePlot"
 ],
 "LEADER_CLEOPATRA_ALT": [
  "StandardSettlePlot"
 ],
 "LEADER_SUNDIATA_KEITA": [
  "StandardSettlePlot"
 ],
 "LEADER_T_ROOSEVELT_ROUGHRIDER": [
  "StandardSettlePlot"
 ]
};
export const AI_PLOT_EVAL_BY_CIV: Readonly<Record<string, readonly string[]>> = {
 "CIVILIZATION_MAORI": [
  "MaoriSettlePreferences"
 ],
 "CIVILIZATION_MAYA": [
  "MayanEmpire"
 ],
 "CIVILIZATION_VIETNAM": [
  "VietnamSettlePreferences"
 ]
};
export const AI_PLOT_EVAL_BY_STRATEGY: Readonly<Record<string, readonly string[]>> = {
 "STRATEGY_NAVAL": [
  "NavalSettlementPreferences"
 ],
 "STRATEGY_RAPID_EXPANSION": [
  "ExpansionSettlementPreferences"
 ]
};
export const AI_FEATURES: readonly AiFeature[] = [
 {
  "type": "FEATURE_FLOODPLAINS",
  "settlement": true,
  "naturalWonder": false
 },
 {
  "type": "FEATURE_ICE",
  "settlement": true,
  "naturalWonder": false
 },
 {
  "type": "FEATURE_JUNGLE",
  "settlement": true,
  "naturalWonder": false
 },
 {
  "type": "FEATURE_FOREST",
  "settlement": true,
  "naturalWonder": false
 },
 {
  "type": "FEATURE_OASIS",
  "settlement": false,
  "naturalWonder": false
 },
 {
  "type": "FEATURE_MARSH",
  "settlement": true,
  "naturalWonder": false
 },
 {
  "type": "FEATURE_BARRIER_REEF",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_CLIFFS_DOVER",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_CRATER_LAKE",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_DEAD_SEA",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_EVEREST",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_GALAPAGOS",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_KILIMANJARO",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_PANTANAL",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_PIOPIOTAHI",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_TORRES_DEL_PAINE",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_TSINGY",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_YOSEMITE",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_DELICATE_ARCH",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_EYE_OF_THE_SAHARA",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_LAKE_RETBA",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_MATTERHORN",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_RORAIMA",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_UBSUNUR_HOLLOW",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_ZHANGYE_DANXIA",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_REEF",
  "settlement": true,
  "naturalWonder": false
 },
 {
  "type": "FEATURE_FLOODPLAINS_GRASSLAND",
  "settlement": true,
  "naturalWonder": false
 },
 {
  "type": "FEATURE_FLOODPLAINS_PLAINS",
  "settlement": true,
  "naturalWonder": false
 },
 {
  "type": "FEATURE_GEOTHERMAL_FISSURE",
  "settlement": true,
  "naturalWonder": false
 },
 {
  "type": "FEATURE_VOLCANO",
  "settlement": true,
  "naturalWonder": false
 },
 {
  "type": "FEATURE_VOLCANIC_SOIL",
  "settlement": true,
  "naturalWonder": false
 },
 {
  "type": "FEATURE_CHOCOLATEHILLS",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_DEVILSTOWER",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_GOBUSTAN",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_IKKIL",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_PAMUKKALE",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_VESUVIUS",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_WHITEDESERT",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_ULURU",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_BERMUDA_TRIANGLE",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_FOUNTAIN_OF_YOUTH",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_PAITITI",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_BURNING_FOREST",
  "settlement": false,
  "naturalWonder": false
 },
 {
  "type": "FEATURE_BURNT_FOREST",
  "settlement": false,
  "naturalWonder": false
 },
 {
  "type": "FEATURE_BURNING_JUNGLE",
  "settlement": false,
  "naturalWonder": false
 },
 {
  "type": "FEATURE_BURNT_JUNGLE",
  "settlement": false,
  "naturalWonder": false
 },
 {
  "type": "FEATURE_HA_LONG_BAY",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_EYJAFJALLAJOKULL",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_LYSEFJORDEN",
  "settlement": false,
  "naturalWonder": true
 },
 {
  "type": "FEATURE_GIANTS_CAUSEWAY",
  "settlement": false,
  "naturalWonder": true
 }
];
export const AI_RESOURCE_CLASS: Readonly<Record<string, string>> = {
 "RESOURCE_BANANAS": "RESOURCECLASS_BONUS",
 "RESOURCE_CATTLE": "RESOURCECLASS_BONUS",
 "RESOURCE_COPPER": "RESOURCECLASS_BONUS",
 "RESOURCE_CRABS": "RESOURCECLASS_BONUS",
 "RESOURCE_DEER": "RESOURCECLASS_BONUS",
 "RESOURCE_FISH": "RESOURCECLASS_BONUS",
 "RESOURCE_RICE": "RESOURCECLASS_BONUS",
 "RESOURCE_SHEEP": "RESOURCECLASS_BONUS",
 "RESOURCE_STONE": "RESOURCECLASS_BONUS",
 "RESOURCE_WHEAT": "RESOURCECLASS_BONUS",
 "RESOURCE_CITRUS": "RESOURCECLASS_LUXURY",
 "RESOURCE_COCOA": "RESOURCECLASS_LUXURY",
 "RESOURCE_COFFEE": "RESOURCECLASS_LUXURY",
 "RESOURCE_COTTON": "RESOURCECLASS_LUXURY",
 "RESOURCE_DIAMONDS": "RESOURCECLASS_LUXURY",
 "RESOURCE_DYES": "RESOURCECLASS_LUXURY",
 "RESOURCE_FURS": "RESOURCECLASS_LUXURY",
 "RESOURCE_GYPSUM": "RESOURCECLASS_LUXURY",
 "RESOURCE_INCENSE": "RESOURCECLASS_LUXURY",
 "RESOURCE_IVORY": "RESOURCECLASS_LUXURY",
 "RESOURCE_JADE": "RESOURCECLASS_LUXURY",
 "RESOURCE_MARBLE": "RESOURCECLASS_LUXURY",
 "RESOURCE_MERCURY": "RESOURCECLASS_LUXURY",
 "RESOURCE_PEARLS": "RESOURCECLASS_LUXURY",
 "RESOURCE_SALT": "RESOURCECLASS_LUXURY",
 "RESOURCE_SILK": "RESOURCECLASS_LUXURY",
 "RESOURCE_SILVER": "RESOURCECLASS_LUXURY",
 "RESOURCE_SPICES": "RESOURCECLASS_LUXURY",
 "RESOURCE_SUGAR": "RESOURCECLASS_LUXURY",
 "RESOURCE_TEA": "RESOURCECLASS_LUXURY",
 "RESOURCE_TOBACCO": "RESOURCECLASS_LUXURY",
 "RESOURCE_TRUFFLES": "RESOURCECLASS_LUXURY",
 "RESOURCE_WHALES": "RESOURCECLASS_LUXURY",
 "RESOURCE_WINE": "RESOURCECLASS_LUXURY",
 "RESOURCE_JEANS": "RESOURCECLASS_LUXURY",
 "RESOURCE_PERFUME": "RESOURCECLASS_LUXURY",
 "RESOURCE_COSMETICS": "RESOURCECLASS_LUXURY",
 "RESOURCE_TOYS": "RESOURCECLASS_LUXURY",
 "RESOURCE_CINNAMON": "RESOURCECLASS_LUXURY",
 "RESOURCE_CLOVES": "RESOURCECLASS_LUXURY",
 "RESOURCE_ALUMINUM": "RESOURCECLASS_STRATEGIC",
 "RESOURCE_COAL": "RESOURCECLASS_STRATEGIC",
 "RESOURCE_HORSES": "RESOURCECLASS_STRATEGIC",
 "RESOURCE_IRON": "RESOURCECLASS_STRATEGIC",
 "RESOURCE_NITER": "RESOURCECLASS_STRATEGIC",
 "RESOURCE_OIL": "RESOURCECLASS_STRATEGIC",
 "RESOURCE_URANIUM": "RESOURCECLASS_STRATEGIC",
 "RESOURCE_ANTIQUITY_SITE": "RESOURCECLASS_ARTIFACT",
 "RESOURCE_SHIPWRECK": "RESOURCECLASS_ARTIFACT",
 "RESOURCE_AMBER": "RESOURCECLASS_LUXURY",
 "RESOURCE_OLIVES": "RESOURCECLASS_LUXURY",
 "RESOURCE_TURTLES": "RESOURCECLASS_LUXURY",
 "RESOURCE_MAIZE": "RESOURCECLASS_BONUS",
 "RESOURCE_HONEY": "RESOURCECLASS_LUXURY"
};
export const AI_GLOBALS: Readonly<Record<string, number>> = {
 "CITY_MIN_RANGE": 3,
 "COMBAT_BOMBARD_VS_UNIT_STRENGTH_MODIFIER": 17,
 "AI_ISLAND_COAST_PERCENTAGE": 20
};
export const AI_STRATEGIES: readonly AiStrategy[] = [
 {
  "type": "VICTORY_STRATEGY_CULTURAL_VICTORY",
  "victory": "VICTORY_CULTURE",
  "needed": 3,
  "conditions": [
   {
    "fn": "Good Culture",
    "threshold": 50,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Has Great Writer",
    "threshold": 1,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Has Great Artist",
    "threshold": 1,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Has Great Musician",
    "threshold": 1,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Has Great Works",
    "threshold": 3,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Is Not Major",
    "threshold": 0,
    "string": null,
    "disqualifier": true,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Tourists Taken",
    "threshold": 75,
    "string": null,
    "disqualifier": false,
    "exclusive": true,
    "forbidden": false
   }
  ]
 },
 {
  "type": "VICTORY_STRATEGY_MILITARY_VICTORY",
  "victory": "VICTORY_CONQUEST",
  "needed": 3,
  "conditions": [
   {
    "fn": "Has Taken Capital",
    "threshold": 1,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Has Opponents",
    "threshold": 2,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Leads Military",
    "threshold": 25,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Leads Score",
    "threshold": 10,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Next Lower Score",
    "threshold": 100,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Has Taken Capital",
    "threshold": 2,
    "string": null,
    "disqualifier": false,
    "exclusive": true,
    "forbidden": false
   },
   {
    "fn": "Is Not Major",
    "threshold": 0,
    "string": null,
    "disqualifier": true,
    "exclusive": false,
    "forbidden": false
   }
  ]
 },
 {
  "type": "VICTORY_STRATEGY_RELIGIOUS_VICTORY",
  "victory": "VICTORY_RELIGIOUS",
  "needed": 2,
  "conditions": [
   {
    "fn": "Good Faith City",
    "threshold": 1,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Founded Religion",
    "threshold": 0,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Unconverted Cities",
    "threshold": 2,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Cannot Found Religion",
    "threshold": 0,
    "string": null,
    "disqualifier": true,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Religion Destroyed",
    "threshold": 0,
    "string": null,
    "disqualifier": true,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Is Not Major",
    "threshold": 0,
    "string": null,
    "disqualifier": true,
    "exclusive": false,
    "forbidden": false
   }
  ]
 },
 {
  "type": "VICTORY_STRATEGY_SCIENCE_VICTORY",
  "victory": "VICTORY_TECHNOLOGY",
  "needed": 3,
  "conditions": [
   {
    "fn": "Good Tech City",
    "threshold": 1,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Is Renaissance",
    "threshold": 1,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Has Science Wonders",
    "threshold": 2,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Has Tech Lead",
    "threshold": 33,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Lags Military",
    "threshold": 33,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Finished Space Project",
    "threshold": 1,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Finished Space Project",
    "threshold": 2,
    "string": null,
    "disqualifier": false,
    "exclusive": true,
    "forbidden": false
   },
   {
    "fn": "Is Not Major",
    "threshold": 0,
    "string": null,
    "disqualifier": true,
    "exclusive": false,
    "forbidden": false
   }
  ]
 },
 {
  "type": "STRATEGY_EARLY_EXPLORATION",
  "victory": null,
  "needed": 1,
  "conditions": [
   {
    "fn": "Is Not Major",
    "threshold": 0,
    "string": null,
    "disqualifier": true,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Fewer Cities",
    "threshold": 1,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   }
  ]
 },
 {
  "type": "STRATEGY_RAPID_EXPANSION",
  "victory": null,
  "needed": 3,
  "conditions": [
   {
    "fn": "Has Settle Spot",
    "threshold": 0,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Cities Under Threat",
    "threshold": 1,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Major Civ Wars",
    "threshold": 1,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Is Not Major",
    "threshold": 0,
    "string": null,
    "disqualifier": true,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Handicap at or below",
    "threshold": 2,
    "string": null,
    "disqualifier": true,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Is In Dark Age",
    "threshold": 0,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": true
   }
  ]
 },
 {
  "type": "STRATEGY_NAVAL",
  "victory": null,
  "needed": 1,
  "conditions": [
   {
    "fn": "Is On Island",
    "threshold": 0,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   }
  ]
 },
 {
  "type": "STRATEGY_CLASSICAL_CHANGES",
  "victory": null,
  "needed": 1,
  "conditions": [
   {
    "fn": "Is Classical",
    "threshold": 0,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Is Not Major",
    "threshold": 0,
    "string": null,
    "disqualifier": true,
    "exclusive": false,
    "forbidden": false
   }
  ]
 },
 {
  "type": "STRATEGY_MEDIEVAL_CHANGES",
  "victory": null,
  "needed": 1,
  "conditions": [
   {
    "fn": "Is Medieval",
    "threshold": 0,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Is Not Major",
    "threshold": 0,
    "string": null,
    "disqualifier": true,
    "exclusive": false,
    "forbidden": false
   }
  ]
 },
 {
  "type": "STRATEGY_RENAISSANCE_CHANGES",
  "victory": null,
  "needed": 1,
  "conditions": [
   {
    "fn": "Is Renaissance",
    "threshold": 0,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Is Not Major",
    "threshold": 0,
    "string": null,
    "disqualifier": true,
    "exclusive": false,
    "forbidden": false
   }
  ]
 },
 {
  "type": "STRATEGY_INDUSTRIAL_CHANGES",
  "victory": null,
  "needed": 1,
  "conditions": [
   {
    "fn": "Is Industrial",
    "threshold": 0,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Is Not Major",
    "threshold": 0,
    "string": null,
    "disqualifier": true,
    "exclusive": false,
    "forbidden": false
   }
  ]
 },
 {
  "type": "STRATEGY_MODERN_CHANGES",
  "victory": null,
  "needed": 1,
  "conditions": [
   {
    "fn": "Is Modern",
    "threshold": 0,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Is Not Major",
    "threshold": 0,
    "string": null,
    "disqualifier": true,
    "exclusive": false,
    "forbidden": false
   }
  ]
 },
 {
  "type": "STRATEGY_WONDER_OBSESSED",
  "victory": null,
  "needed": 2,
  "conditions": [
   {
    "fn": "Has Agenda",
    "threshold": 0,
    "string": "AGENDA_WONDER_OBSESSED",
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Is Industrial",
    "threshold": 0,
    "string": "AGENDA_WONDER_OBSESSED",
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   }
  ]
 },
 {
  "type": "STRATEGY_DARKAGE",
  "victory": null,
  "needed": 1,
  "conditions": [
   {
    "fn": "Is Not Major",
    "threshold": 0,
    "string": null,
    "disqualifier": true,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Is In Dark Age",
    "threshold": 1,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   }
  ]
 },
 {
  "type": "VICTORY_STRATEGY_DIPLOMATIC_VICTORY",
  "victory": "VICTORY_DIPLOMATIC",
  "needed": 2,
  "conditions": [
   {
    "fn": "Has Diplomatic Victory Points",
    "threshold": 1,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Leads Diplomatic Victory Points",
    "threshold": 1,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Percentage Diplomatic Victory Points",
    "threshold": 25,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Percentage Diplomatic Victory Points",
    "threshold": 60,
    "string": null,
    "disqualifier": false,
    "exclusive": true,
    "forbidden": false
   },
   {
    "fn": "Is Not Major",
    "threshold": 0,
    "string": null,
    "disqualifier": true,
    "exclusive": false,
    "forbidden": false
   }
  ]
 },
 {
  "type": "STRATEGY_ANCIENT_CHANGES",
  "victory": null,
  "needed": 1,
  "conditions": [
   {
    "fn": "Is Ancient",
    "threshold": 0,
    "string": null,
    "disqualifier": false,
    "exclusive": false,
    "forbidden": false
   },
   {
    "fn": "Is Not Major",
    "threshold": 0,
    "string": null,
    "disqualifier": true,
    "exclusive": false,
    "forbidden": false
   }
  ]
 }
];
export const AI_STRATEGY_BIAS_BY_LEADER: Readonly<Record<string, readonly AiStrategyBias[]>> = {
 "LEADER_ABRAHAM_LINCOLN": [
  {
   "strategy": "VICTORY_STRATEGY_RELIGIOUS_VICTORY",
   "value": 5,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_ALEXANDER": [
  {
   "strategy": "VICTORY_STRATEGY_MILITARY_VICTORY",
   "value": -2,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_AMANITORE": [
  {
   "strategy": "VICTORY_STRATEGY_SCIENCE_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_CATHERINE_DE_MEDICI": [
  {
   "strategy": "VICTORY_STRATEGY_CULTURAL_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_CATHERINE_DE_MEDICI_ALT": [
  {
   "strategy": "VICTORY_STRATEGY_CULTURAL_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_ELEANOR_FRANCE": [
  {
   "strategy": "VICTORY_STRATEGY_CULTURAL_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_GANDHI": [
  {
   "strategy": "VICTORY_STRATEGY_RELIGIOUS_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_GILGAMESH": [
  {
   "strategy": "VICTORY_STRATEGY_SCIENCE_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_GORGO": [
  {
   "strategy": "VICTORY_STRATEGY_CULTURAL_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_JADWIGA": [
  {
   "strategy": "VICTORY_STRATEGY_RELIGIOUS_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_JAYAVARMAN": [
  {
   "strategy": "VICTORY_STRATEGY_RELIGIOUS_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_JOHN_CURTIN": [
  {
   "strategy": "VICTORY_STRATEGY_SCIENCE_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_KRISTINA": [
  {
   "strategy": "VICTORY_STRATEGY_CULTURAL_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "strategy": "VICTORY_STRATEGY_DIPLOMATIC_VICTORY",
   "value": -2,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_KUPE": [
  {
   "strategy": "VICTORY_STRATEGY_CULTURAL_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_LAURIER": [
  {
   "strategy": "VICTORY_STRATEGY_DIPLOMATIC_VICTORY",
   "value": -2,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_LUDWIG": [
  {
   "strategy": "VICTORY_STRATEGY_CULTURAL_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "strategy": "VICTORY_STRATEGY_RELIGIOUS_VICTORY",
   "value": 5,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_MVEMBA": [
  {
   "strategy": "VICTORY_STRATEGY_CULTURAL_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_NZINGA_MBANDE": [
  {
   "strategy": "VICTORY_STRATEGY_CULTURAL_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_PACHACUTI": [
  {
   "strategy": "VICTORY_STRATEGY_SCIENCE_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_PEDRO": [
  {
   "strategy": "VICTORY_STRATEGY_CULTURAL_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_PERICLES": [
  {
   "strategy": "VICTORY_STRATEGY_CULTURAL_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "strategy": "VICTORY_STRATEGY_DIPLOMATIC_VICTORY",
   "value": -2,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_PETER_GREAT": [
  {
   "strategy": "VICTORY_STRATEGY_RELIGIOUS_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_PHILIP_II": [
  {
   "strategy": "VICTORY_STRATEGY_RELIGIOUS_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_QIN": [
  {
   "strategy": "VICTORY_STRATEGY_CULTURAL_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_RAMSES": [
  {
   "strategy": "VICTORY_STRATEGY_CULTURAL_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_ROBERT_THE_BRUCE": [
  {
   "strategy": "VICTORY_STRATEGY_SCIENCE_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_SALADIN": [
  {
   "strategy": "VICTORY_STRATEGY_RELIGIOUS_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_SALADIN_ALT": [
  {
   "strategy": "VICTORY_STRATEGY_RELIGIOUS_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_SEJONG": [
  {
   "strategy": "VICTORY_STRATEGY_SCIENCE_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_SEONDEOK": [
  {
   "strategy": "VICTORY_STRATEGY_SCIENCE_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_SUNDIATA_KEITA": [
  {
   "strategy": "VICTORY_STRATEGY_CULTURAL_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_TAMAR": [
  {
   "strategy": "VICTORY_STRATEGY_RELIGIOUS_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "strategy": "VICTORY_STRATEGY_DIPLOMATIC_VICTORY",
   "value": -2,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_THEODORA": [
  {
   "strategy": "VICTORY_STRATEGY_RELIGIOUS_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_TOKUGAWA": [
  {
   "strategy": "VICTORY_STRATEGY_SCIENCE_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_T_ROOSEVELT": [
  {
   "strategy": "VICTORY_STRATEGY_CULTURAL_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "strategy": "VICTORY_STRATEGY_RELIGIOUS_VICTORY",
   "value": 5,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "strategy": "VICTORY_STRATEGY_DIPLOMATIC_VICTORY",
   "value": -2,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_T_ROOSEVELT_ROUGHRIDER": [
  {
   "strategy": "VICTORY_STRATEGY_CULTURAL_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "strategy": "VICTORY_STRATEGY_RELIGIOUS_VICTORY",
   "value": 5,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_WU_ZETIAN": [
  {
   "strategy": "VICTORY_STRATEGY_CULTURAL_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LEADER_YONGLE": [
  {
   "strategy": "VICTORY_STRATEGY_SCIENCE_VICTORY",
   "value": -1,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ]
};
export const AI_STRATEGY_BIAS_BY_CIV: Readonly<Record<string, readonly AiStrategyBias[]>> = {};
export const AI_BELIEFS: readonly AiBelief[] = [
 {
  "type": "BELIEF_DANCE_OF_THE_AURORA",
  "class": "BELIEF_CLASS_PANTHEON",
  "modifiers": [
   {
    "id": "DANCE_OF_THE_AURORA_FAITHTUNDRAADJACENCY",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_TERRAIN_ADJACENCY",
    "args": {
     "DistrictType": "DISTRICT_HOLY_SITE",
     "TerrainType": "TERRAIN_TUNDRA",
     "YieldType": "YIELD_FAITH",
     "Amount": "1",
     "Description": "LOC_DISTRICT_TUNDRA_FAITH"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "DANCE_OF_THE_AURORA_FAITHTUNDRAHILLSADJACENCY",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_TERRAIN_ADJACENCY",
    "args": {
     "DistrictType": "DISTRICT_HOLY_SITE",
     "TerrainType": "TERRAIN_TUNDRA_HILLS",
     "YieldType": "YIELD_FAITH",
     "Amount": "1",
     "Description": "LOC_DISTRICT_TUNDRA_FAITH"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_DESERT_FOLKLORE",
  "class": "BELIEF_CLASS_PANTHEON",
  "modifiers": [
   {
    "id": "DESERT_FOLKLORE_FAITHDESERTADJACENCY",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_TERRAIN_ADJACENCY",
    "args": {
     "DistrictType": "DISTRICT_HOLY_SITE",
     "TerrainType": "TERRAIN_DESERT",
     "YieldType": "YIELD_FAITH",
     "Amount": "1",
     "Description": "LOC_DISTRICT_DESERT_FAITH"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "DESERT_FOLKLORE_FAITHDESERTHILLSADJACENCY",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_TERRAIN_ADJACENCY",
    "args": {
     "DistrictType": "DISTRICT_HOLY_SITE",
     "TerrainType": "TERRAIN_DESERT_HILLS",
     "YieldType": "YIELD_FAITH",
     "Amount": "1",
     "Description": "LOC_DISTRICT_DESERT_FAITH"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_SACRED_PATH",
  "class": "BELIEF_CLASS_PANTHEON",
  "modifiers": [
   {
    "id": "SACRED_PATH_FAITHFEATUREADJACENCY",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_FEATURE_ADJACENCY",
    "args": {
     "DistrictType": "DISTRICT_HOLY_SITE",
     "FeatureType": "FEATURE_JUNGLE",
     "YieldType": "YIELD_FAITH",
     "Amount": "1",
     "Description": "LOC_DISTRICT_JUNGLE_FAITH"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_RIVER_GODDESS",
  "class": "BELIEF_CLASS_PANTHEON",
  "modifiers": [
   {
    "id": "RIVER_GODDESS_HOLY_SITE_AMENITIES",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "RIVER_GODDESS_HOLY_SITE_AMENITIES_MODIFIER"
    },
    "attach": {
     "id": "RIVER_GODDESS_HOLY_SITE_AMENITIES_MODIFIER",
     "collection": "COLLECTION_CITY_DISTRICTS",
     "effect": "EFFECT_ADJUST_DISTRICT_AMENITY",
     "args": {
      "Amount": "2"
     },
     "subjectReqs": {
      "test": "ALL",
      "reqs": [
       {
        "type": "REQUIREMENT_PLOT_DISTRICT_TYPE_MATCHES",
        "inverse": false,
        "args": {
         "DistrictType": "DISTRICT_HOLY_SITE"
        }
       },
       {
        "type": "REQUIREMENT_PLOT_ADJACENT_TO_RIVER",
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
       "type": "REQUIREMENT_CITY_FOLLOWS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "RIVER_GODDESS_HOLY_SITE_HOUSING",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "RIVER_GODDESS_HOLY_SITE_HOUSING_MODIFIER"
    },
    "attach": {
     "id": "RIVER_GODDESS_HOLY_SITE_HOUSING_MODIFIER",
     "collection": "COLLECTION_CITY_DISTRICTS",
     "effect": "EFFECT_ADJUST_DISTRICT_HOUSING",
     "args": {
      "Amount": "2"
     },
     "subjectReqs": {
      "test": "ALL",
      "reqs": [
       {
        "type": "REQUIREMENT_PLOT_DISTRICT_TYPE_MATCHES",
        "inverse": false,
        "args": {
         "DistrictType": "DISTRICT_HOLY_SITE"
        }
       },
       {
        "type": "REQUIREMENT_PLOT_ADJACENT_TO_RIVER",
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
       "type": "REQUIREMENT_CITY_FOLLOWS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_MONUMENT_TO_THE_GODS",
  "class": "BELIEF_CLASS_PANTHEON",
  "modifiers": [
   {
    "id": "MONUMENT_TO_THE_GODS_ANCIENTCLASSICALWONDER",
    "collection": "COLLECTION_ALL_PLAYERS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "MONUMENT_TO_THE_GODS_ANCIENTCLASSICALWONDER_MODIFIER"
    },
    "attach": {
     "id": "MONUMENT_TO_THE_GODS_ANCIENTCLASSICALWONDER_MODIFIER",
     "collection": "COLLECTION_PLAYER_CITIES",
     "effect": "EFFECT_ADJUST_WONDER_ERA_PRODUCTION",
     "args": {
      "Amount": "15",
      "IsWonder": "true",
      "StartEra": "ERA_ANCIENT",
      "EndEra": "ERA_CLASSICAL"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_HAS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_DIVINE_SPARK",
  "class": "BELIEF_CLASS_PANTHEON",
  "modifiers": [
   {
    "id": "DIVINE_SPARK_HOLY_SITE",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "DIVINE_SPARK_HOLY_SITE_MODIFIER"
    },
    "attach": {
     "id": "DIVINE_SPARK_HOLY_SITE_MODIFIER",
     "collection": "COLLECTION_CITY_DISTRICTS",
     "effect": "EFFECT_ADJUST_DISTRICT_GREAT_PERSON_POINTS",
     "args": {
      "GreatPersonClassType": "GREAT_PERSON_CLASS_PROPHET",
      "Amount": "1"
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
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "DIVINE_SPARK_SCIENTIST",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "DIVINE_SPARK_SCIENTIST_MODIFIER"
    },
    "attach": {
     "id": "DIVINE_SPARK_SCIENTIST_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADJUST_GREAT_PERSON_POINTS",
     "args": {
      "GreatPersonClassType": "GREAT_PERSON_CLASS_SCIENTIST",
      "Amount": "1"
     },
     "subjectReqs": {
      "test": "ALL",
      "reqs": [
       {
        "type": "REQUIREMENT_CITY_HAS_BUILDING",
        "inverse": false,
        "args": {
         "BuildingType": "BUILDING_LIBRARY"
        }
       }
      ]
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "DIVINE_SPARK_WRITER",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "DIVINE_SPARK_WRITER_MODIFIER"
    },
    "attach": {
     "id": "DIVINE_SPARK_WRITER_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADJUST_GREAT_PERSON_POINTS",
     "args": {
      "GreatPersonClassType": "GREAT_PERSON_CLASS_WRITER",
      "Amount": "1"
     },
     "subjectReqs": {
      "test": "ALL",
      "reqs": [
       {
        "type": "REQUIREMENT_CITY_HAS_BUILDING",
        "inverse": false,
        "args": {
         "BuildingType": "BUILDING_AMPHITHEATER"
        }
       }
      ]
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_LADY_OF_THE_REEDS_AND_MARSHES",
  "class": "BELIEF_CLASS_PANTHEON",
  "modifiers": [
   {
    "id": "LADY_OF_THE_REEDS_PRODUCTION2",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "LADY_OF_THE_REEDS_PRODUCTION2_MODIFIER"
    },
    "attach": {
     "id": "LADY_OF_THE_REEDS_PRODUCTION2_MODIFIER",
     "collection": "COLLECTION_CITY_PLOT_YIELDS",
     "effect": "EFFECT_ADJUST_PLOT_YIELD",
     "args": {
      "YieldType": "YIELD_PRODUCTION",
      "Amount": "2"
     },
     "subjectReqs": {
      "test": "ANY",
      "reqs": [
       {
        "type": "REQUIREMENT_PLOT_FEATURE_TYPE_MATCHES",
        "inverse": false,
        "args": {
         "FeatureType": "FEATURE_MARSH"
        }
       },
       {
        "type": "REQUIREMENT_PLOT_FEATURE_TYPE_MATCHES",
        "inverse": false,
        "args": {
         "FeatureType": "FEATURE_OASIS"
        }
       },
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
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_GOD_OF_THE_SEA",
  "class": "BELIEF_CLASS_PANTHEON",
  "modifiers": [
   {
    "id": "GOD_OF_THE_SEA_FISHINGBOATS_PRODUCTION",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "GOD_OF_THE_SEA_FISHINGBOATS_PRODUCTION_MODIFIER"
    },
    "attach": {
     "id": "GOD_OF_THE_SEA_FISHINGBOATS_PRODUCTION_MODIFIER",
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
        "type": "REQUIREMENT_PLOT_IMPROVEMENT_TYPE_MATCHES",
        "inverse": false,
        "args": {
         "ImprovementType": "IMPROVEMENT_FISHING_BOATS"
        }
       }
      ]
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_GOD_OF_THE_OPEN_SKY",
  "class": "BELIEF_CLASS_PANTHEON",
  "modifiers": [
   {
    "id": "GOD_OF_THE_OPEN_SKY_PASTURE_CULTURE",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "GOD_OF_THE_OPEN_SKY_PASTURE_CULTURE_MODIFIER"
    },
    "attach": {
     "id": "GOD_OF_THE_OPEN_SKY_PASTURE_CULTURE_MODIFIER",
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
        "type": "REQUIREMENT_PLOT_IMPROVEMENT_TYPE_MATCHES",
        "inverse": false,
        "args": {
         "ImprovementType": "IMPROVEMENT_PASTURE"
        }
       }
      ]
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_GODDESS_OF_THE_HUNT",
  "class": "BELIEF_CLASS_PANTHEON",
  "modifiers": [
   {
    "id": "GODDESS_OF_THE_HUNT_CAMP_FOOD",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "GODDESS_OF_THE_HUNT_CAMP_FOOD_MODIFIER"
    },
    "attach": {
     "id": "GODDESS_OF_THE_HUNT_CAMP_FOOD_MODIFIER",
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
        "type": "REQUIREMENT_PLOT_IMPROVEMENT_TYPE_MATCHES",
        "inverse": false,
        "args": {
         "ImprovementType": "IMPROVEMENT_CAMP"
        }
       }
      ]
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "GODDESS_OF_THE_HUNT_CAMP_PRODUCTION",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "GODDESS_OF_THE_HUNT_CAMP_PRODUCTION_MODIFIER"
    },
    "attach": {
     "id": "GODDESS_OF_THE_HUNT_CAMP_PRODUCTION_MODIFIER",
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
        "type": "REQUIREMENT_PLOT_IMPROVEMENT_TYPE_MATCHES",
        "inverse": false,
        "args": {
         "ImprovementType": "IMPROVEMENT_CAMP"
        }
       }
      ]
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_STONE_CIRCLES",
  "class": "BELIEF_CLASS_PANTHEON",
  "modifiers": [
   {
    "id": "STONE_CIRCLES_QUARRY_FAITH",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "STONE_CIRCLES_QUARRY_FAITH_MODIFIER"
    },
    "attach": {
     "id": "STONE_CIRCLES_QUARRY_FAITH_MODIFIER",
     "collection": "COLLECTION_CITY_PLOT_YIELDS",
     "effect": "EFFECT_ADJUST_PLOT_YIELD",
     "args": {
      "YieldType": "YIELD_FAITH",
      "Amount": "2"
     },
     "subjectReqs": {
      "test": "ALL",
      "reqs": [
       {
        "type": "REQUIREMENT_PLOT_IMPROVEMENT_TYPE_MATCHES",
        "inverse": false,
        "args": {
         "ImprovementType": "IMPROVEMENT_QUARRY"
        }
       }
      ]
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_RELIGIOUS_IDOLS",
  "class": "BELIEF_CLASS_PANTHEON",
  "modifiers": [
   {
    "id": "RELIGIOUS_IDOLS_BONUS_MINE_FAITH",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "RELIGIOUS_IDOLS_BONUS_MINE_FAITH_MODIFIER"
    },
    "attach": {
     "id": "RELIGIOUS_IDOLS_BONUS_MINE_FAITH_MODIFIER",
     "collection": "COLLECTION_CITY_PLOT_YIELDS",
     "effect": "EFFECT_ADJUST_PLOT_YIELD",
     "args": {
      "YieldType": "YIELD_FAITH",
      "Amount": "2"
     },
     "subjectReqs": {
      "test": "ALL",
      "reqs": [
       {
        "type": "REQUIREMENT_PLOT_RESOURCE_CLASS_TYPE_MATCHES",
        "inverse": false,
        "args": {
         "ResourceClassType": "RESOURCECLASS_BONUS"
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
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "RELIGIOUS_IDOLS_LUXURY_MINE_FAITH",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "RELIGIOUS_IDOLS_LUXURY_MINE_FAITH_MODIFIER"
    },
    "attach": {
     "id": "RELIGIOUS_IDOLS_LUXURY_MINE_FAITH_MODIFIER",
     "collection": "COLLECTION_CITY_PLOT_YIELDS",
     "effect": "EFFECT_ADJUST_PLOT_YIELD",
     "args": {
      "YieldType": "YIELD_FAITH",
      "Amount": "2"
     },
     "subjectReqs": {
      "test": "ALL",
      "reqs": [
       {
        "type": "REQUIREMENT_PLOT_RESOURCE_CLASS_TYPE_MATCHES",
        "inverse": false,
        "args": {
         "ResourceClassType": "RESOURCECLASS_LUXURY"
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
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_GOD_OF_CRAFTSMEN",
  "class": "BELIEF_CLASS_PANTHEON",
  "modifiers": [
   {
    "id": "GOD_OF_CRAFTSMEN_STRATEGIC_IMPROVED_PRODUCTION",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "GOD_OF_CRAFTSMEN_STRATEGIC_IMPROVED_PRODUCTION_MODIFIER"
    },
    "attach": {
     "id": "GOD_OF_CRAFTSMEN_STRATEGIC_IMPROVED_PRODUCTION_MODIFIER",
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
        "type": "REQUIREMENT_PLOT_IMPROVED_RESOURCE_CLASS_TYPE_MATCHES",
        "inverse": false,
        "args": {
         "ResourceClassType": "RESOURCECLASS_STRATEGIC"
        }
       }
      ]
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "GOD_OF_CRAFTSMEN_STRATEGIC_IMPROVED_FAITH",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "GOD_OF_CRAFTSMEN_STRATEGIC_IMPROVED_FAITH_MODIFIER"
    },
    "attach": {
     "id": "GOD_OF_CRAFTSMEN_STRATEGIC_IMPROVED_FAITH_MODIFIER",
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
        "type": "REQUIREMENT_PLOT_IMPROVED_RESOURCE_CLASS_TYPE_MATCHES",
        "inverse": false,
        "args": {
         "ResourceClassType": "RESOURCECLASS_STRATEGIC"
        }
       }
      ]
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_GODDESS_OF_FESTIVALS",
  "class": "BELIEF_CLASS_PANTHEON",
  "modifiers": [
   {
    "id": "GODDESS_OF_FESTIVALS_PLANTATION_CULTURE",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "GODDESS_OF_FESTIVALS_PLANTATION_CULTURE_MODIFIER"
    },
    "attach": {
     "id": "GODDESS_OF_FESTIVALS_PLANTATION_CULTURE_MODIFIER",
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
        "type": "REQUIREMENT_PLOT_IMPROVEMENT_TYPE_MATCHES",
        "inverse": false,
        "args": {
         "ImprovementType": "IMPROVEMENT_PLANTATION"
        }
       }
      ]
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_GOD_OF_THE_FORGE",
  "class": "BELIEF_CLASS_PANTHEON",
  "modifiers": [
   {
    "id": "GOD_OF_THE_FORGE_UNIT_ANCIENT_CLASSICAL_PRODUCTION",
    "collection": "COLLECTION_ALL_PLAYERS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "GOD_OF_THE_FORGE_UNIT_ANCIENT_CLASSICAL_PRODUCTION_MODIFIER"
    },
    "attach": {
     "id": "GOD_OF_THE_FORGE_UNIT_ANCIENT_CLASSICAL_PRODUCTION_MODIFIER",
     "collection": "COLLECTION_PLAYER_CITIES",
     "effect": "EFFECT_ADJUST_CITY_ALL_MILITARY_UNITS_PRODUCTION",
     "args": {
      "Amount": "25",
      "StartEra": "ERA_ANCIENT",
      "EndEra": "ERA_CLASSICAL"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_HAS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_INITIATION_RITES",
  "class": "BELIEF_CLASS_PANTHEON",
  "modifiers": [
   {
    "id": "INITIATION_RITES_FAITH_DISPERSAL",
    "collection": "COLLECTION_ALL_PLAYERS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "INITIATION_RITES_FAITH_DISPERSAL_MODIFIER"
    },
    "attach": {
     "id": "INITIATION_RITES_FAITH_DISPERSAL_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADJUST_PLAYER_FAITH_FROM_DISPERSAL",
     "args": {
      "Amount": "50"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_HAS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "INITIATION_RITES_HEALING_DISPERSAL",
    "collection": "COLLECTION_ALL_PLAYERS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "INITIATION_RITES_HEALING_DISPERSAL_MODIFIER"
    },
    "attach": {
     "id": "INITIATION_RITES_HEALING_DISPERSAL_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADJUST_PLAYER_HEALING_FROM_DISPERSAL",
     "args": {
      "Amount": "100"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_HAS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_GOD_OF_HEALING",
  "class": "BELIEF_CLASS_PANTHEON",
  "modifiers": [
   {
    "id": "GOD_OF_HEALING_UNIT_HEALING",
    "collection": "COLLECTION_ALL_PLAYERS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "GOD_OF_HEALING_UNIT_HEALING_MODIFIER"
    },
    "attach": {
     "id": "GOD_OF_HEALING_UNIT_HEALING_MODIFIER",
     "collection": "COLLECTION_PLAYER_UNITS",
     "effect": "EFFECT_ADJUST_UNIT_HEALING_MODIFIERS",
     "args": {
      "Amount": "30",
      "Type": "ALL"
     },
     "subjectReqs": {
      "test": "ALL",
      "reqs": [
       {
        "type": "REQUIREMENT_PLOT_ADJACENT_DISTRICT_TYPE_MATCHES",
        "inverse": false,
        "args": {
         "DistrictType": "DISTRICT_HOLY_SITE",
         "MinRange": "0"
        }
       }
      ]
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_HAS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_GOD_OF_WAR",
  "class": "BELIEF_CLASS_PANTHEON",
  "modifiers": [
   {
    "id": "GOD_OF_WAR_FAITH_KILLS",
    "collection": "COLLECTION_ALL_PLAYERS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "GOD_OF_WAR_FAITH_KILLS_MODIFIER"
    },
    "attach": {
     "id": "GOD_OF_WAR_FAITH_KILLS_MODIFIER",
     "collection": "COLLECTION_PLAYER_COMBAT",
     "effect": "EFFECT_ADJUST_UNIT_POST_COMBAT_YIELD",
     "args": {
      "YieldType": "YIELD_FAITH",
      "PercentDefeatedStrength": "50"
     },
     "subjectReqs": {
      "test": "ALL",
      "reqs": [
       {
        "type": "REQUIREMENT_PLOT_ADJACENT_DISTRICT_TYPE_MATCHES",
        "inverse": false,
        "args": {
         "DistrictType": "DISTRICT_HOLY_SITE",
         "MinRange": "0",
         "MaxRange": "8"
        }
       }
      ]
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_HAS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_FERTILITY_RITES",
  "class": "BELIEF_CLASS_PANTHEON",
  "modifiers": [
   {
    "id": "FERTILITY_RITES_GROWTH",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ADJUST_CITY_GROWTH",
    "args": {
     "Amount": "10"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "FERTILITY_RITES_BUILDER",
    "collection": "COLLECTION_ALL_PLAYERS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "FERTILITY_RITES_BUILDER_MODIFIER"
    },
    "attach": {
     "id": "FERTILITY_RITES_BUILDER_MODIFIER",
     "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
     "effect": "EFFECT_GRANT_UNIT_IN_CITY",
     "args": {
      "UnitType": "UNIT_BUILDER",
      "Amount": "1",
      "AllowUniqueOverride": "false"
     },
     "subjectReqs": {
      "test": "ALL",
      "reqs": [
       {
        "type": "REQUIREMENT_PLAYER_HAS_AT_LEAST_NUMBER_CITIES",
        "inverse": false,
        "args": {
         "Amount": "1"
        }
       }
      ]
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_HAS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_RELIGIOUS_SETTLEMENTS",
  "class": "BELIEF_CLASS_PANTHEON",
  "modifiers": [
   {
    "id": "RELIGIOUS_SETTLEMENTS_CULTUREBORDER",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ADJUST_CITY_CULTURE_BORDER_EXPANSION",
    "args": {
     "Amount": "15"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "RELIGIOUS_SETTLEMENTS_SETTLER",
    "collection": "COLLECTION_ALL_PLAYERS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "RELIGIOUS_SETTLEMENTS_SETTLER_MODIFIER"
    },
    "attach": {
     "id": "RELIGIOUS_SETTLEMENTS_SETTLER_MODIFIER",
     "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
     "effect": "EFFECT_GRANT_UNIT_IN_CITY",
     "args": {
      "UnitType": "UNIT_SETTLER",
      "Amount": "1",
      "AllowUniqueOverride": "false"
     },
     "subjectReqs": {
      "test": "ALL",
      "reqs": [
       {
        "type": "REQUIREMENT_PLAYER_HAS_AT_LEAST_NUMBER_CITIES",
        "inverse": false,
        "args": {
         "Amount": "1"
        }
       }
      ]
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_HAS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_CITY_PATRON_GODDESS",
  "class": "BELIEF_CLASS_PANTHEON",
  "modifiers": [
   {
    "id": "CITY_PATRON_GODDESS_DISTRICT_PRODUCTION",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "CITY_PATRON_GODDESS_DISTRICT_PRODUCTION_MODIFIER"
    },
    "attach": {
     "id": "CITY_PATRON_GODDESS_DISTRICT_PRODUCTION_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADJUST_ALL_DISTRICT_PRODUCTION_MODIFIER",
     "args": {
      "Amount": "25"
     },
     "subjectReqs": {
      "test": "ALL",
      "reqs": [
       {
        "type": "REQUIREMENT_CITY_HAS_X_SPECIALTY_DISTRICTS",
        "inverse": true,
        "args": {
         "Amount": "1",
         "MustBeFunctioning": "false"
        }
       }
      ]
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_EARTH_GODDESS",
  "class": "BELIEF_CLASS_PANTHEON",
  "modifiers": [
   {
    "id": "EARTH_GODDESS_APPEAL_FAITH",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "EARTH_GODDESS_APPEAL_FAITH_MODIFIER"
    },
    "attach": {
     "id": "EARTH_GODDESS_APPEAL_FAITH_MODIFIER",
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
        "type": "REQUIREMENT_PLOT_IS_APPEAL_BETWEEN",
        "inverse": false,
        "args": {
         "MinimumAppeal": "4"
        }
       }
      ]
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_DIVINE_INSPIRATION",
  "class": "BELIEF_CLASS_FOLLOWER",
  "modifiers": [
   {
    "id": "DIVINE_INSPIRATION_WONDER_FAITH",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "DIVINE_INSPIRATION_WONDER_FAITH_MODIFIER"
    },
    "attach": {
     "id": "DIVINE_INSPIRATION_WONDER_FAITH_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADJUST_WONDER_YIELD_CHANGE",
     "args": {
      "YieldType": "YIELD_FAITH",
      "Amount": "4"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_RELIGION",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_FEED_THE_WORLD",
  "class": "BELIEF_CLASS_FOLLOWER",
  "modifiers": [
   {
    "id": "FEED_THE_WORLD_SHRINE_FOOD3",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "FEED_THE_WORLD_SHRINE_FOOD3_MODIFIER"
    },
    "attach": {
     "id": "FEED_THE_WORLD_SHRINE_FOOD3_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
     "args": {
      "BuildingType": "BUILDING_SHRINE",
      "YieldType": "YIELD_FOOD",
      "Amount": "3"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_RELIGION",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "FEED_THE_WORLD_TEMPLE_FOOD3",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "FEED_THE_WORLD_TEMPLE_FOOD3_MODIFIER"
    },
    "attach": {
     "id": "FEED_THE_WORLD_TEMPLE_FOOD3_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
     "args": {
      "BuildingType": "BUILDING_TEMPLE",
      "YieldType": "YIELD_FOOD",
      "Amount": "3"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_RELIGION",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "FEED_THE_WORLD_SHRINE_HOUSING",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "FEED_THE_WORLD_SHRINE_HOUSING_MODIFIER"
    },
    "attach": {
     "id": "FEED_THE_WORLD_SHRINE_HOUSING_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADJUST_BUILDING_HOUSING",
     "args": {
      "Amount": "2"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_RELIGION",
       "inverse": false,
       "args": {}
      },
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_SHRINE"
       }
      }
     ]
    }
   },
   {
    "id": "FEED_THE_WORLD_TEMPLE_HOUSING",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "FEED_THE_WORLD_TEMPLE_HOUSING_MODIFIER"
    },
    "attach": {
     "id": "FEED_THE_WORLD_TEMPLE_HOUSING_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADJUST_BUILDING_HOUSING",
     "args": {
      "Amount": "2"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_RELIGION",
       "inverse": false,
       "args": {}
      },
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_TEMPLE"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_JESUIT_EDUCATION",
  "class": "BELIEF_CLASS_FOLLOWER",
  "modifiers": [
   {
    "id": "JESUIT_EDUCATION_SCIENCE_BUILDINGS",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "JESUIT_EDUCATION_SCIENCE_BUILDINGS_MODIFIER"
    },
    "attach": {
     "id": "JESUIT_EDUCATION_SCIENCE_BUILDINGS_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ENABLE_BUILDING_FAITH_PURCHASE",
     "args": {
      "DistrictType": "DISTRICT_CAMPUS"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_RELIGION",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "JESUIT_EDUCATION_CULTURE_BUILDINGS",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "JESUIT_EDUCATION_CULTURE_BUILDINGS_MODIFIER"
    },
    "attach": {
     "id": "JESUIT_EDUCATION_CULTURE_BUILDINGS_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ENABLE_BUILDING_FAITH_PURCHASE",
     "args": {
      "DistrictType": "DISTRICT_THEATER"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_RELIGION",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_RELIQUARIES",
  "class": "BELIEF_CLASS_FOLLOWER",
  "modifiers": [
   {
    "id": "RELIQUARIES_RELIC_FAITH",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "RELIQUARIES_RELIC_FAITH_MODIFIER"
    },
    "attach": {
     "id": "RELIQUARIES_RELIC_FAITH_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADJUST_CITY_GREATWORK_YIELD",
     "args": {
      "GreatWorkObjectType": "GREATWORKOBJECT_RELIC",
      "YieldType": "YIELD_FAITH",
      "ScalingFactor": "300"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_RELIGION",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "RELIQUARIES_RELIC_TOURISM",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "RELIQUARIES_RELIC_TOURISM_MODIFIER"
    },
    "attach": {
     "id": "RELIQUARIES_RELIC_TOURISM_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADJUST_CITY_TOURISM",
     "args": {
      "GreatWorkObjectType": "GREATWORKOBJECT_RELIC",
      "ScalingFactor": "300"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_RELIGION",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_RELIGIOUS_COMMUNITY",
  "class": "BELIEF_CLASS_FOLLOWER",
  "modifiers": [
   {
    "id": "RELIGIOUS_COMMUNITY_HOLY_SITE_TRADING",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "RELIGIOUS_COMMUNITY_HOLY_SITE_TRADING_MODIFIER"
    },
    "attach": {
     "id": "RELIGIOUS_COMMUNITY_HOLY_SITE_TRADING_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADJUST_CITY_TRADE_ROUTE_YIELD_FOR_INTERNATIONAL",
     "args": {
      "YieldType": "YIELD_GOLD",
      "Amount": "2"
     },
     "subjectReqs": {
      "test": "ALL",
      "reqs": [
       {
        "type": "REQUIREMENT_CITY_HAS_DISTRICT",
        "inverse": false,
        "args": {
         "DistrictType": "DISTRICT_HOLY_SITE"
        }
       }
      ]
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_RELIGION",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "RELIGIOUS_COMMUNITY_SHRINE_TRADING",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "RELIGIOUS_COMMUNITY_SHRINE_TRADING_MODIFIER"
    },
    "attach": {
     "id": "RELIGIOUS_COMMUNITY_SHRINE_TRADING_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADJUST_CITY_TRADE_ROUTE_YIELD_FOR_INTERNATIONAL",
     "args": {
      "YieldType": "YIELD_GOLD",
      "Amount": "2"
     },
     "subjectReqs": {
      "test": "ALL",
      "reqs": [
       {
        "type": "REQUIREMENT_CITY_HAS_BUILDING",
        "inverse": false,
        "args": {
         "BuildingType": "BUILDING_SHRINE"
        }
       }
      ]
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_RELIGION",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "RELIGIOUS_COMMUNITY_TEMPLE_TRADING",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "RELIGIOUS_COMMUNITY_TEMPLE_TRADING_MODIFIER"
    },
    "attach": {
     "id": "RELIGIOUS_COMMUNITY_TEMPLE_TRADING_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADJUST_CITY_TRADE_ROUTE_YIELD_FOR_INTERNATIONAL",
     "args": {
      "YieldType": "YIELD_GOLD",
      "Amount": "2"
     },
     "subjectReqs": {
      "test": "ALL",
      "reqs": [
       {
        "type": "REQUIREMENT_CITY_HAS_BUILDING",
        "inverse": false,
        "args": {
         "BuildingType": "BUILDING_TEMPLE"
        }
       }
      ]
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_RELIGION",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "RELIGIOUS_COMMUNITY_TIER3_TRADING",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "RELIGIOUS_COMMUNITY_TIER3_TRADING_MODIFIER"
    },
    "attach": {
     "id": "RELIGIOUS_COMMUNITY_TIER3_TRADING_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADJUST_CITY_TRADE_ROUTE_YIELD_FOR_INTERNATIONAL",
     "args": {
      "YieldType": "YIELD_GOLD",
      "Amount": "2"
     },
     "subjectReqs": {
      "test": "ANY",
      "reqs": [
       {
        "type": "REQUIREMENT_CITY_HAS_BUILDING",
        "inverse": false,
        "args": {
         "BuildingType": "BUILDING_CATHEDRAL"
        }
       },
       {
        "type": "REQUIREMENT_CITY_HAS_BUILDING",
        "inverse": false,
        "args": {
         "BuildingType": "BUILDING_DAR_E_MEHR"
        }
       },
       {
        "type": "REQUIREMENT_CITY_HAS_BUILDING",
        "inverse": false,
        "args": {
         "BuildingType": "BUILDING_GURDWARA"
        }
       },
       {
        "type": "REQUIREMENT_CITY_HAS_BUILDING",
        "inverse": false,
        "args": {
         "BuildingType": "BUILDING_MEETING_HOUSE"
        }
       },
       {
        "type": "REQUIREMENT_CITY_HAS_BUILDING",
        "inverse": false,
        "args": {
         "BuildingType": "BUILDING_MOSQUE"
        }
       },
       {
        "type": "REQUIREMENT_CITY_HAS_BUILDING",
        "inverse": false,
        "args": {
         "BuildingType": "BUILDING_PAGODA"
        }
       },
       {
        "type": "REQUIREMENT_CITY_HAS_BUILDING",
        "inverse": false,
        "args": {
         "BuildingType": "BUILDING_STUPA"
        }
       },
       {
        "type": "REQUIREMENT_CITY_HAS_BUILDING",
        "inverse": false,
        "args": {
         "BuildingType": "BUILDING_SYNAGOGUE"
        }
       },
       {
        "type": "REQUIREMENT_CITY_HAS_BUILDING",
        "inverse": false,
        "args": {
         "BuildingType": "BUILDING_WAT"
        }
       }
      ]
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_RELIGION",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_WORK_ETHIC",
  "class": "BELIEF_CLASS_FOLLOWER",
  "modifiers": [
   {
    "id": "WORK_ETHIC_ADJACENCY_PRODUCTION_2",
    "collection": "COLLECTION_ALL_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_YIELD_BASED_ON_ADJACENCY_BONUS",
    "args": {
     "YieldTypeToMirror": "YIELD_FAITH",
     "YieldTypeToGrant": "YIELD_PRODUCTION"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_RELIGION",
       "inverse": false,
       "args": {}
      },
      {
       "type": "REQUIREMENT_PLOT_DISTRICT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_HOLY_SITE"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_ZEN_MEDITATION",
  "class": "BELIEF_CLASS_FOLLOWER",
  "modifiers": [
   {
    "id": "ZEN_MEDITATION_AMENITY",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "ZEN_MEDITATION_AMENITY_MODIFIER"
    },
    "attach": {
     "id": "ZEN_MEDITATION_AMENITY_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADJUST_CITY_AMENITIES_FROM_RELIGION",
     "args": {
      "Amount": "1"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_RELIGION",
       "inverse": false,
       "args": {}
      },
      {
       "type": "REQUIREMENT_CITY_HAS_X_SPECIALTY_DISTRICTS",
       "inverse": false,
       "args": {
        "Amount": "2"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_CHORAL_MUSIC",
  "class": "BELIEF_CLASS_FOLLOWER",
  "modifiers": [
   {
    "id": "CHORAL_MUSIC_SHRINE_CULTURE",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "CHORAL_MUSIC_SHRINE_CULTURE_MODIFIER"
    },
    "attach": {
     "id": "CHORAL_MUSIC_SHRINE_CULTURE_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
     "args": {
      "BuildingType": "BUILDING_SHRINE",
      "YieldType": "YIELD_CULTURE",
      "Amount": "2"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_RELIGION",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "CHORAL_MUSIC_TEMPLE_CULTURE",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "CHORAL_MUSIC_TEMPLE_CULTURE_MODIFIER"
    },
    "attach": {
     "id": "CHORAL_MUSIC_TEMPLE_CULTURE_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
     "args": {
      "BuildingType": "BUILDING_TEMPLE",
      "YieldType": "YIELD_CULTURE",
      "Amount": "4"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_RELIGION",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_WARRIOR_MONKS",
  "class": "BELIEF_CLASS_FOLLOWER",
  "modifiers": [
   {
    "id": "ALLOW_WARRIOR_MONKS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADD_RELIGIOUS_UNIT",
    "args": {
     "UnitType": "UNIT_WARRIOR_MONK"
    }
   },
   {
    "id": "WARRIOR_MONKS_CULTURE_BOMB_TRIGGER_HOLY_SITE",
    "collection": "COLLECTION_ALL_PLAYERS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "WARRIOR_MONKS_CULTURE_BOMB_TRIGGER_HOLY_SITE_MODIFIER"
    },
    "attach": {
     "id": "WARRIOR_MONKS_CULTURE_BOMB_TRIGGER_HOLY_SITE_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADD_CULTURE_BOMB_TRIGGER",
     "args": {
      "DistrictType": "DISTRICT_HOLY_SITE"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_RELIGION_FOUNDER",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_CATHEDRAL",
  "class": "BELIEF_CLASS_WORSHIP",
  "modifiers": [
   {
    "id": "ALLOW_CATHEDRAL",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADD_RELIGIOUS_BUILDING",
    "args": {
     "BuildingType": "BUILDING_CATHEDRAL"
    }
   }
  ]
 },
 {
  "type": "BELIEF_GURDWARA",
  "class": "BELIEF_CLASS_WORSHIP",
  "modifiers": [
   {
    "id": "ALLOW_GURDWARA",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADD_RELIGIOUS_BUILDING",
    "args": {
     "BuildingType": "BUILDING_GURDWARA"
    }
   }
  ]
 },
 {
  "type": "BELIEF_MEETING_HOUSE",
  "class": "BELIEF_CLASS_WORSHIP",
  "modifiers": [
   {
    "id": "ALLOW_MEETING_HOUSE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADD_RELIGIOUS_BUILDING",
    "args": {
     "BuildingType": "BUILDING_MEETING_HOUSE"
    }
   }
  ]
 },
 {
  "type": "BELIEF_MOSQUE",
  "class": "BELIEF_CLASS_WORSHIP",
  "modifiers": [
   {
    "id": "ALLOW_MOSQUE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADD_RELIGIOUS_BUILDING",
    "args": {
     "BuildingType": "BUILDING_MOSQUE"
    }
   }
  ]
 },
 {
  "type": "BELIEF_PAGODA",
  "class": "BELIEF_CLASS_WORSHIP",
  "modifiers": [
   {
    "id": "ALLOW_PAGODA",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADD_RELIGIOUS_BUILDING",
    "args": {
     "BuildingType": "BUILDING_PAGODA"
    }
   }
  ]
 },
 {
  "type": "BELIEF_SYNAGOGUE",
  "class": "BELIEF_CLASS_WORSHIP",
  "modifiers": [
   {
    "id": "ALLOW_SYNAGOGUE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADD_RELIGIOUS_BUILDING",
    "args": {
     "BuildingType": "BUILDING_SYNAGOGUE"
    }
   }
  ]
 },
 {
  "type": "BELIEF_WAT",
  "class": "BELIEF_CLASS_WORSHIP",
  "modifiers": [
   {
    "id": "ALLOW_WAT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADD_RELIGIOUS_BUILDING",
    "args": {
     "BuildingType": "BUILDING_WAT"
    }
   }
  ]
 },
 {
  "type": "BELIEF_STUPA",
  "class": "BELIEF_CLASS_WORSHIP",
  "modifiers": [
   {
    "id": "ALLOW_STUPA",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADD_RELIGIOUS_BUILDING",
    "args": {
     "BuildingType": "BUILDING_STUPA"
    }
   }
  ]
 },
 {
  "type": "BELIEF_DAR_E_MEHR",
  "class": "BELIEF_CLASS_WORSHIP",
  "modifiers": [
   {
    "id": "ALLOW_DAR_E_MEHR",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADD_RELIGIOUS_BUILDING",
    "args": {
     "BuildingType": "BUILDING_DAR_E_MEHR"
    }
   }
  ]
 },
 {
  "type": "BELIEF_LAY_MINISTRY",
  "class": "BELIEF_CLASS_FOUNDER",
  "modifiers": [
   {
    "id": "LAY_MINISTRY_CULTURE_DISTRICTS",
    "collection": "COLLECTION_ALL_PLAYERS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "LAY_MINISTRY_CULTURE_DISTRICTS_MODIFIER"
    },
    "attach": {
     "id": "LAY_MINISTRY_CULTURE_DISTRICTS_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADD_RELIGIOUS_BELIEF_YIELD",
     "args": {
      "BeliefYieldType": "BELIEF_YIELD_PER_DISTRICT",
      "YieldType": "YIELD_CULTURE",
      "Amount": "1",
      "PerXItems": "1",
      "DistrictType": "DISTRICT_THEATER"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_RELIGION_FOUNDER",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "LAY_MINISTRY_FAITH_DISTRICTS",
    "collection": "COLLECTION_ALL_PLAYERS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "LAY_MINISTRY_FAITH_DISTRICTS_MODIFIER"
    },
    "attach": {
     "id": "LAY_MINISTRY_FAITH_DISTRICTS_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADD_RELIGIOUS_BELIEF_YIELD",
     "args": {
      "BeliefYieldType": "BELIEF_YIELD_PER_DISTRICT",
      "YieldType": "YIELD_FAITH",
      "Amount": "1",
      "PerXItems": "1",
      "DistrictType": "DISTRICT_HOLY_SITE"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_RELIGION_FOUNDER",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_PAPAL_PRIMACY",
  "class": "BELIEF_CLASS_FOUNDER",
  "modifiers": [
   {
    "id": "PAPAL_PRIMACY_PRESSURE_ON_ADOPTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ENABLE_RELIGION_AWARDS_ENVOY_RELIGIOUS_PRESSURE",
    "args": {
     "Amount": "200"
    }
   }
  ]
 },
 {
  "type": "BELIEF_PILGRIMAGE",
  "class": "BELIEF_CLASS_FOUNDER",
  "modifiers": [
   {
    "id": "PILGRIMAGE_FAITH_CITY",
    "collection": "COLLECTION_ALL_PLAYERS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "PILGRIMAGE_FAITH_CITY_MODIFIER"
    },
    "attach": {
     "id": "PILGRIMAGE_FAITH_CITY_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADD_RELIGIOUS_BELIEF_YIELD",
     "args": {
      "BeliefYieldType": "BELIEF_YIELD_PER_CITY",
      "YieldType": "YIELD_FAITH",
      "Amount": "2",
      "PerXItems": "1"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_RELIGION_FOUNDER",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_STEWARDSHIP",
  "class": "BELIEF_CLASS_FOUNDER",
  "modifiers": [
   {
    "id": "STEWARDSHIP_SCIENCE_DISTRICTS",
    "collection": "COLLECTION_ALL_PLAYERS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "STEWARDSHIP_SCIENCE_DISTRICTS_MODIFIER"
    },
    "attach": {
     "id": "STEWARDSHIP_SCIENCE_DISTRICTS_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADD_RELIGIOUS_BELIEF_YIELD",
     "args": {
      "BeliefYieldType": "BELIEF_YIELD_PER_DISTRICT",
      "YieldType": "YIELD_SCIENCE",
      "Amount": "1",
      "PerXItems": "1",
      "DistrictType": "DISTRICT_CAMPUS"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_RELIGION_FOUNDER",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "STEWARDSHIP_GOLD_DISTRICTS",
    "collection": "COLLECTION_ALL_PLAYERS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "STEWARDSHIP_GOLD_DISTRICTS_MODIFIER"
    },
    "attach": {
     "id": "STEWARDSHIP_GOLD_DISTRICTS_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADD_RELIGIOUS_BELIEF_YIELD",
     "args": {
      "BeliefYieldType": "BELIEF_YIELD_PER_DISTRICT",
      "YieldType": "YIELD_GOLD",
      "Amount": "1",
      "PerXItems": "1",
      "DistrictType": "DISTRICT_COMMERCIAL_HUB"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_RELIGION_FOUNDER",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_TITHE",
  "class": "BELIEF_CLASS_FOUNDER",
  "modifiers": [
   {
    "id": "TITHE_GOLD_CITY",
    "collection": "COLLECTION_ALL_PLAYERS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "TITHE_GOLD_CITY_MODIFIER"
    },
    "attach": {
     "id": "TITHE_GOLD_CITY_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADD_RELIGIOUS_BELIEF_YIELD",
     "args": {
      "BeliefYieldType": "BELIEF_YIELD_PER_CITY",
      "YieldType": "YIELD_GOLD",
      "Amount": "3",
      "PerXItems": "1"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_RELIGION_FOUNDER",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_WORLD_CHURCH",
  "class": "BELIEF_CLASS_FOUNDER",
  "modifiers": [
   {
    "id": "WORLD_CHURCH_CULTURE_FOLLOWER",
    "collection": "COLLECTION_ALL_PLAYERS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "WORLD_CHURCH_CULTURE_FOLLOWER_MODIFIER"
    },
    "attach": {
     "id": "WORLD_CHURCH_CULTURE_FOLLOWER_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADD_RELIGIOUS_BELIEF_YIELD",
     "args": {
      "BeliefYieldType": "BELIEF_YIELD_PER_FOLLOWER",
      "YieldType": "YIELD_CULTURE",
      "Amount": "1",
      "PerXItems": "4"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_RELIGION_FOUNDER",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_CROSS_CULTURAL_DIALOGUE",
  "class": "BELIEF_CLASS_FOUNDER",
  "modifiers": [
   {
    "id": "CROSS_CULTURAL_DIALOGUE_SCIENCE_FOLLOWER",
    "collection": "COLLECTION_ALL_PLAYERS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "CROSS_CULTURAL_DIALOGUE_SCIENCE_FOLLOWER_MODIFIER"
    },
    "attach": {
     "id": "CROSS_CULTURAL_DIALOGUE_SCIENCE_FOLLOWER_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADD_RELIGIOUS_BELIEF_YIELD",
     "args": {
      "BeliefYieldType": "BELIEF_YIELD_PER_FOLLOWER",
      "YieldType": "YIELD_SCIENCE",
      "Amount": "1",
      "PerXItems": "4"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_RELIGION_FOUNDER",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_RELIGIOUS_UNITY",
  "class": "BELIEF_CLASS_FOUNDER",
  "modifiers": [
   {
    "id": "RELIGIOUS_UNITY_ENVOY_ON_ADOPTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ENABLE_RELIGION_AWARDS_ENVOY",
    "args": {
     "Enable": "true"
    }
   }
  ]
 },
 {
  "type": "BELIEF_DEFENDER_OF_FAITH",
  "class": "BELIEF_CLASS_ENHANCER",
  "modifiers": [
   {
    "id": "DEFENDER_OF_FAITH_COMBAT_BONUS",
    "collection": "COLLECTION_ALL_UNITS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "DEFENDER_OF_FAITH_COMBAT_BONUS_MODIFIER"
    },
    "attach": {
     "id": "DEFENDER_OF_FAITH_COMBAT_BONUS_MODIFIER",
     "collection": "COLLECTION_UNIT_COMBAT",
     "effect": "EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER",
     "args": {
      "Amount": "5"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_RELIGION_FOUNDER",
       "inverse": false,
       "args": {}
      },
      {
       "type": "REQUIREMENT_NEAR_RELIGIOUS_CITY",
       "inverse": false,
       "args": {
        "FriendlyCity": "true"
       }
      },
      {
       "type": "REQUIREMENT_UNIT_TAG_MATCHES",
       "inverse": true,
       "args": {
        "Tag": "CLASS_RELIGIOUS"
       }
      },
      {
       "type": "REQUIREMENT_UNIT_TAG_MATCHES",
       "inverse": true,
       "args": {
        "Tag": "CLASS_SUPPORT"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_HOLY_ORDER",
  "class": "BELIEF_CLASS_ENHANCER",
  "modifiers": [
   {
    "id": "HOLY_ORDER_MISSIONARY_DISCOUNT",
    "collection": "COLLECTION_ALL_PLAYERS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "HOLY_ORDER_MISSIONARY_DISCOUNT_MODIFIER"
    },
    "attach": {
     "id": "HOLY_ORDER_MISSIONARY_DISCOUNT_MODIFIER",
     "collection": "COLLECTION_PLAYER_CITIES",
     "effect": "EFFECT_ADJUST_UNIT_PURCHASE_COST",
     "args": {
      "UnitType": "UNIT_MISSIONARY",
      "Amount": "30"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_RELIGION_FOUNDER",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "HOLY_ORDER_APOSTLE_DISCOUNT",
    "collection": "COLLECTION_ALL_PLAYERS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "HOLY_ORDER_APOSTLE_DISCOUNT_MODIFIER"
    },
    "attach": {
     "id": "HOLY_ORDER_APOSTLE_DISCOUNT_MODIFIER",
     "collection": "COLLECTION_PLAYER_CITIES",
     "effect": "EFFECT_ADJUST_UNIT_PURCHASE_COST",
     "args": {
      "UnitType": "UNIT_APOSTLE",
      "Amount": "30"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_RELIGION_FOUNDER",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_ITINERANT_PREACHERS",
  "class": "BELIEF_CLASS_ENHANCER",
  "modifiers": [
   {
    "id": "ITINERANT_PREACHERS_SPREAD_DISTANCE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_RELIGIOUS_SPREAD_DISTANCE",
    "args": {
     "DistanceChange": "3"
    }
   }
  ]
 },
 {
  "type": "BELIEF_JUST_WAR",
  "class": "BELIEF_CLASS_ENHANCER",
  "modifiers": [
   {
    "id": "JUST_WAR_COMBAT_BONUS",
    "collection": "COLLECTION_ALL_UNITS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "JUST_WAR_COMBAT_BONUS_MODIFIER"
    },
    "attach": {
     "id": "JUST_WAR_COMBAT_BONUS_MODIFIER",
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
       "type": "REQUIREMENT_PLAYER_IS_RELIGION_FOUNDER",
       "inverse": false,
       "args": {}
      },
      {
       "type": "REQUIREMENT_NEAR_RELIGIOUS_CITY",
       "inverse": false,
       "args": {
        "FriendlyCity": "false"
       }
      },
      {
       "type": "REQUIREMENT_UNIT_TAG_MATCHES",
       "inverse": true,
       "args": {
        "Tag": "CLASS_RELIGIOUS"
       }
      },
      {
       "type": "REQUIREMENT_UNIT_TAG_MATCHES",
       "inverse": true,
       "args": {
        "Tag": "CLASS_SUPPORT"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_MISSIONARY_ZEAL",
  "class": "BELIEF_CLASS_ENHANCER",
  "modifiers": [
   {
    "id": "MISSIONARY_ZEAL_IGNORE_TERRAIN",
    "collection": "COLLECTION_ALL_PLAYERS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "MISSIONARY_ZEAL_IGNORE_TERRAIN_MODIFIER"
    },
    "attach": {
     "id": "MISSIONARY_ZEAL_IGNORE_TERRAIN_MODIFIER",
     "collection": "COLLECTION_PLAYER_UNITS",
     "effect": "EFFECT_GRANT_ABILITY",
     "args": {
      "AbilityType": "ABILITY_RELIGIOUS_IGNORE_TERRAIN_COST"
     },
     "ability": [
      {
       "id": "MOD_IGNORE_TERRAIN_COST",
       "collection": "COLLECTION_OWNER",
       "effect": "EFFECT_ADJUST_UNIT_IGNORE_TERRAIN_COST",
       "args": {
        "Ignore": "true",
        "Type": "ALL"
       }
      },
      {
       "id": "MOD_IGNORE_CROSSING_RIVERS_COST",
       "collection": "COLLECTION_OWNER",
       "effect": "EFFECT_ADJUST_UNIT_IGNORE_RIVERS",
       "args": {
        "Ignore": "true"
       }
      }
     ]
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_RELIGION_FOUNDER",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_MONASTIC_ISOLATION",
  "class": "BELIEF_CLASS_ENHANCER",
  "modifiers": [
   {
    "id": "MONASTIC_ISOLATION_REDUCE_COMBAT_LOSS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_RELIGIOUS_COMBAT_LOSS",
    "args": {
     "ReductionPercent": "100"
    }
   }
  ]
 },
 {
  "type": "BELIEF_SCRIPTURE",
  "class": "BELIEF_CLASS_ENHANCER",
  "modifiers": [
   {
    "id": "SCRIPTURE_SPEAD_STRENGTH",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_RELIGIOUS_SPREAD_STRENGTH",
    "args": {
     "SpreadMultiplier": "25",
     "EnhancingTechType": "TECH_PRINTING",
     "TechEnabledSpreadMultiplier": "25"
    }
   }
  ]
 },
 {
  "type": "BELIEF_RELIGIOUS_COLONIZATION",
  "class": "BELIEF_CLASS_ENHANCER",
  "modifiers": [
   {
    "id": "RELIGIOUS_COLONIZATION_AUTO_SPREAD",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ENABLE_RELIGION_AUTO_SPREAD",
    "args": {
     "Enable": "true"
    }
   }
  ]
 },
 {
  "type": "BELIEF_GODDESS_OF_FIRE",
  "class": "BELIEF_CLASS_PANTHEON",
  "modifiers": [
   {
    "id": "GODDESS_OF_FIRE_FEATURES_FAITH",
    "collection": "COLLECTION_ALL_CITIES",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "GODDESS_OF_FIRE_FEATURES_FAITH_MODIFIER"
    },
    "attach": {
     "id": "GODDESS_OF_FIRE_FEATURES_FAITH_MODIFIER",
     "collection": "COLLECTION_CITY_PLOT_YIELDS",
     "effect": "EFFECT_ADJUST_PLOT_YIELD",
     "args": {
      "YieldType": "YIELD_FAITH",
      "Amount": "2"
     },
     "subjectReqs": {
      "test": "ANY",
      "reqs": [
       {
        "type": "REQUIREMENT_PLOT_FEATURE_TYPE_MATCHES",
        "inverse": false,
        "args": {
         "FeatureType": "FEATURE_GEOTHERMAL_FISSURE"
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
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_PANTHEON",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_SACRED_PLACES",
  "class": "BELIEF_CLASS_FOUNDER",
  "modifiers": [
   {
    "id": "SACRED_PLACES_FAITH_WONDER_CITY",
    "collection": "COLLECTION_ALL_PLAYERS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "SACRED_PLACES_FAITH_WONDER_CITY_MODIFIER"
    },
    "attach": {
     "id": "SACRED_PLACES_FAITH_WONDER_CITY_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADD_RELIGIOUS_BELIEF_YIELD",
     "args": {
      "BeliefYieldType": "BELIEF_YIELD_PER_CITY_WITH_WONDER",
      "YieldType": "YIELD_FAITH",
      "Amount": "2",
      "PerXItems": "1"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_RELIGION_FOUNDER",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "SACRED_PLACES_CULTURE_WONDER_CITY",
    "collection": "COLLECTION_ALL_PLAYERS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "SACRED_PLACES_CULTURE_WONDER_CITY_MODIFIER"
    },
    "attach": {
     "id": "SACRED_PLACES_CULTURE_WONDER_CITY_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADD_RELIGIOUS_BELIEF_YIELD",
     "args": {
      "BeliefYieldType": "BELIEF_YIELD_PER_CITY_WITH_WONDER",
      "YieldType": "YIELD_CULTURE",
      "Amount": "2",
      "PerXItems": "1"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_RELIGION_FOUNDER",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "SACRED_PLACES_SCIENCE_WONDER_CITY",
    "collection": "COLLECTION_ALL_PLAYERS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "SACRED_PLACES_SCIENCE_WONDER_CITY_MODIFIER"
    },
    "attach": {
     "id": "SACRED_PLACES_SCIENCE_WONDER_CITY_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADD_RELIGIOUS_BELIEF_YIELD",
     "args": {
      "BeliefYieldType": "BELIEF_YIELD_PER_CITY_WITH_WONDER",
      "YieldType": "YIELD_SCIENCE",
      "Amount": "2",
      "PerXItems": "1"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_RELIGION_FOUNDER",
       "inverse": false,
       "args": {}
      }
     ]
    }
   },
   {
    "id": "SACRED_PLACES_GOLD_WONDER_CITY",
    "collection": "COLLECTION_ALL_PLAYERS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "SACRED_PLACES_GOLD_WONDER_CITY_MODIFIER"
    },
    "attach": {
     "id": "SACRED_PLACES_GOLD_WONDER_CITY_MODIFIER",
     "collection": "COLLECTION_OWNER",
     "effect": "EFFECT_ADD_RELIGIOUS_BELIEF_YIELD",
     "args": {
      "BeliefYieldType": "BELIEF_YIELD_PER_CITY_WITH_WONDER",
      "YieldType": "YIELD_GOLD",
      "Amount": "2",
      "PerXItems": "1"
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_RELIGION_FOUNDER",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "BELIEF_HOLY_WATERS",
  "class": "BELIEF_CLASS_ENHANCER",
  "modifiers": [
   {
    "id": "HOLY_WATERS_HEALING",
    "collection": "COLLECTION_ALL_DISTRICTS",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "HOLY_WATERS_HEALING_MODIFIER"
    },
    "attach": {
     "id": "HOLY_WATERS_HEALING_MODIFIER",
     "collection": "COLLECTION_ALL_UNITS",
     "effect": "EFFECT_ADJUST_UNIT_HEALING_RELIGION_MODIFIERS",
     "args": {
      "Amount": "10",
      "Type": "ALL"
     },
     "subjectReqs": {
      "test": "ALL",
      "reqs": [
       {
        "type": "REQUIREMENT_PLOT_ADJACENT_TO_OWNER",
        "inverse": false,
        "args": {
         "MinDistance": "0"
        }
       }
      ]
     }
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_FOLLOWS_RELIGION",
       "inverse": false,
       "args": {}
      },
      {
       "type": "REQUIREMENT_DISTRICT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_HOLY_SITE"
       }
      }
     ]
    }
   }
  ]
 }
];
export const AI_RELIGIONS: readonly AiReligion[] = [
 {
  "type": "RELIGION_PANTHEON",
  "pantheon": true,
  "customName": false
 },
 {
  "type": "RELIGION_BUDDHISM",
  "pantheon": false,
  "customName": false
 },
 {
  "type": "RELIGION_CATHOLICISM",
  "pantheon": false,
  "customName": false
 },
 {
  "type": "RELIGION_CONFUCIANISM",
  "pantheon": false,
  "customName": false
 },
 {
  "type": "RELIGION_HINDUISM",
  "pantheon": false,
  "customName": false
 },
 {
  "type": "RELIGION_ISLAM",
  "pantheon": false,
  "customName": false
 },
 {
  "type": "RELIGION_JUDAISM",
  "pantheon": false,
  "customName": false
 },
 {
  "type": "RELIGION_ORTHODOXY",
  "pantheon": false,
  "customName": false
 },
 {
  "type": "RELIGION_PROTESTANTISM",
  "pantheon": false,
  "customName": false
 },
 {
  "type": "RELIGION_SHINTO",
  "pantheon": false,
  "customName": false
 },
 {
  "type": "RELIGION_SIKHISM",
  "pantheon": false,
  "customName": false
 },
 {
  "type": "RELIGION_TAOISM",
  "pantheon": false,
  "customName": false
 },
 {
  "type": "RELIGION_ZOROASTRIANISM",
  "pantheon": false,
  "customName": false
 },
 {
  "type": "RELIGION_CUSTOM_1",
  "pantheon": false,
  "customName": true
 },
 {
  "type": "RELIGION_CUSTOM_2",
  "pantheon": false,
  "customName": true
 },
 {
  "type": "RELIGION_CUSTOM_3",
  "pantheon": false,
  "customName": true
 },
 {
  "type": "RELIGION_CUSTOM_4",
  "pantheon": false,
  "customName": true
 },
 {
  "type": "RELIGION_CUSTOM_5",
  "pantheon": false,
  "customName": true
 },
 {
  "type": "RELIGION_CUSTOM_6",
  "pantheon": false,
  "customName": true
 },
 {
  "type": "RELIGION_CUSTOM_7",
  "pantheon": false,
  "customName": true
 },
 {
  "type": "RELIGION_CUSTOM_8",
  "pantheon": false,
  "customName": true
 },
 {
  "type": "RELIGION_CUSTOM_9",
  "pantheon": false,
  "customName": true
 },
 {
  "type": "RELIGION_CUSTOM_10",
  "pantheon": false,
  "customName": true
 },
 {
  "type": "RELIGION_CUSTOM_11",
  "pantheon": false,
  "customName": true
 },
 {
  "type": "RELIGION_CUSTOM_12",
  "pantheon": false,
  "customName": true
 }
];
export const AI_FAVORED_RELIGIONS_BY_LEADER: Readonly<Record<string, readonly string[]>> = {
 "LEADER_ABRAHAM_LINCOLN": [
  "RELIGION_PROTESTANTISM"
 ],
 "LEADER_BARBAROSSA": [
  "RELIGION_CATHOLICISM"
 ],
 "LEADER_BASIL": [
  "RELIGION_ORTHODOXY"
 ],
 "LEADER_CATHERINE_DE_MEDICI": [
  "RELIGION_CATHOLICISM"
 ],
 "LEADER_CATHERINE_DE_MEDICI_ALT": [
  "RELIGION_CATHOLICISM"
 ],
 "LEADER_CHANDRAGUPTA": [
  "RELIGION_HINDUISM"
 ],
 "LEADER_CYRUS": [
  "RELIGION_ZOROASTRIANISM"
 ],
 "LEADER_DIDO": [
  "RELIGION_JUDAISM"
 ],
 "LEADER_ELEANOR_ENGLAND": [
  "RELIGION_CATHOLICISM"
 ],
 "LEADER_ELEANOR_FRANCE": [
  "RELIGION_CATHOLICISM"
 ],
 "LEADER_ELIZABETH": [
  "RELIGION_PROTESTANTISM"
 ],
 "LEADER_GANDHI": [
  "RELIGION_HINDUISM"
 ],
 "LEADER_GITARJA": [
  "RELIGION_HINDUISM"
 ],
 "LEADER_HARALD_ALT": [
  "RELIGION_ORTHODOXY"
 ],
 "LEADER_HARDRADA": [
  "RELIGION_PROTESTANTISM"
 ],
 "LEADER_HOJO": [
  "RELIGION_BUDDHISM"
 ],
 "LEADER_JADWIGA": [
  "RELIGION_CATHOLICISM"
 ],
 "LEADER_JAYAVARMAN": [
  "RELIGION_BUDDHISM"
 ],
 "LEADER_JOAO_III": [
  "RELIGION_CATHOLICISM"
 ],
 "LEADER_KRISTINA": [
  "RELIGION_PROTESTANTISM"
 ],
 "LEADER_KUBLAI_KHAN_CHINA": [
  "RELIGION_BUDDHISM"
 ],
 "LEADER_KUBLAI_KHAN_MONGOLIA": [
  "RELIGION_BUDDHISM"
 ],
 "LEADER_LAURIER": [
  "RELIGION_CATHOLICISM"
 ],
 "LEADER_LUDWIG": [
  "RELIGION_CATHOLICISM"
 ],
 "LEADER_MANSA_MUSA": [
  "RELIGION_ISLAM"
 ],
 "LEADER_MATTHIAS_CORVINUS": [
  "RELIGION_CATHOLICISM"
 ],
 "LEADER_MENELIK": [
  "RELIGION_ORTHODOXY"
 ],
 "LEADER_MVEMBA": [
  "RELIGION_CATHOLICISM"
 ],
 "LEADER_NADER_SHAH": [
  "RELIGION_ISLAM"
 ],
 "LEADER_PEDRO": [
  "RELIGION_CATHOLICISM"
 ],
 "LEADER_PETER_GREAT": [
  "RELIGION_ORTHODOXY"
 ],
 "LEADER_PHILIP_II": [
  "RELIGION_CATHOLICISM"
 ],
 "LEADER_QIN": [
  "RELIGION_TAOISM"
 ],
 "LEADER_QIN_ALT": [
  "RELIGION_TAOISM"
 ],
 "LEADER_ROBERT_THE_BRUCE": [
  "RELIGION_CATHOLICISM"
 ],
 "LEADER_SALADIN": [
  "RELIGION_ISLAM"
 ],
 "LEADER_SALADIN_ALT": [
  "RELIGION_ISLAM"
 ],
 "LEADER_SEJONG": [
  "RELIGION_CONFUCIANISM"
 ],
 "LEADER_SEONDEOK": [
  "RELIGION_BUDDHISM"
 ],
 "LEADER_SIMON_BOLIVAR": [
  "RELIGION_CATHOLICISM"
 ],
 "LEADER_SULEIMAN": [
  "RELIGION_ISLAM"
 ],
 "LEADER_SULEIMAN_ALT": [
  "RELIGION_ISLAM"
 ],
 "LEADER_SUNDIATA_KEITA": [
  "RELIGION_ISLAM"
 ],
 "LEADER_TAMAR": [
  "RELIGION_ORTHODOXY"
 ],
 "LEADER_THEODORA": [
  "RELIGION_ORTHODOXY"
 ],
 "LEADER_TOKUGAWA": [
  "RELIGION_BUDDHISM"
 ],
 "LEADER_T_ROOSEVELT": [
  "RELIGION_PROTESTANTISM"
 ],
 "LEADER_T_ROOSEVELT_ROUGHRIDER": [
  "RELIGION_PROTESTANTISM"
 ],
 "LEADER_VICTORIA": [
  "RELIGION_PROTESTANTISM"
 ],
 "LEADER_VICTORIA_ALT": [
  "RELIGION_PROTESTANTISM"
 ],
 "LEADER_WILHELMINA": [
  "RELIGION_PROTESTANTISM"
 ],
 "LEADER_WU_ZETIAN": [
  "RELIGION_BUDDHISM"
 ],
 "LEADER_YONGLE": [
  "RELIGION_CONFUCIANISM"
 ]
};
export const AI_FAVORED_RELIGIONS_BY_CIV: Readonly<Record<string, readonly string[]>> = {};
export const AI_GOVERNORS: readonly AiGovernor[] = [
 {
  "type": "GOVERNOR_THE_DEFENDER",
  "identityPressure": 8,
  "assignCityState": false,
  "assignToMajor": false,
  "trait": null,
  "promotions": [
   "GOVERNOR_PROMOTION_REDOUBT",
   "GOVERNOR_PROMOTION_GARRISON_COMMANDER",
   "GOVERNOR_PROMOTION_DEFENSE_LOGISTICS",
   "GOVERNOR_PROMOTION_EMBRASURE",
   "GOVERNOR_PROMOTION_AIR_DEFENSE_INITIATIVE",
   "GOVERNOR_PROMOTION_EDUCATOR_ARMS_RACE_PROPONENT"
  ],
  "modifiers": [
   {
    "id": "DEFENDER_ADJUST_CITY_DEFENSE_STRENGTH",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_INNER_DEFENSE",
    "args": {
     "Amount": "5"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_THE_AMBASSADOR",
  "identityPressure": 8,
  "assignCityState": true,
  "assignToMajor": false,
  "trait": null,
  "promotions": [
   "GOVERNOR_PROMOTION_AMBASSADOR_MESSENGER",
   "GOVERNOR_PROMOTION_AMBASSADOR_EMISSARY",
   "GOVERNOR_PROMOTION_AMBASSADOR_AFFLUENCE",
   "GOVERNOR_PROMOTION_LOCAL_INFORMANTS",
   "GOVERNOR_PROMOTION_AMBASSADOR_FOREIGN_INVESTOR",
   "GOVERNOR_PROMOTION_AMBASSADOR_PUPPETEER"
  ],
  "modifiers": [
   {
    "id": "MESSENGER_GRANT_FREE_ENVOYS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GOVERNOR_ADJUST_CITY_TOKENS_GRANTED",
    "args": {
     "Amount": "2"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_THE_CARDINAL",
  "identityPressure": 8,
  "assignCityState": false,
  "assignToMajor": false,
  "trait": null,
  "promotions": [
   "GOVERNOR_PROMOTION_CARDINAL_BISHOP",
   "GOVERNOR_PROMOTION_CARDINAL_GRAND_INQUISITOR",
   "GOVERNOR_PROMOTION_CARDINAL_LAYING_ON_OF_HANDS",
   "GOVERNOR_PROMOTION_CARDINAL_CITADEL_OF_GOD",
   "GOVERNOR_PROMOTION_CARDINAL_PATRON_SAINT",
   "GOVERNOR_PROMOTION_CARDINAL_DIVINE_ARCHITECT"
  ],
  "modifiers": [
   {
    "id": "CARDINAL_BISHOP_PRESSURE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_RELIGION_PRESSURE",
    "args": {
     "Amount": "100"
    }
   },
   {
    "id": "CARDINAL_BISHOP_FAITH_DISTRICT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_YIELD_PER_DISTRICT",
    "args": {
     "YieldType": "YIELD_FAITH",
     "Amount": "2"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_THE_RESOURCE_MANAGER",
  "identityPressure": 8,
  "assignCityState": false,
  "assignToMajor": false,
  "trait": null,
  "promotions": [
   "GOVERNOR_PROMOTION_RESOURCE_MANAGER_GROUNDBREAKER",
   "GOVERNOR_PROMOTION_RESOURCE_MANAGER_SURPLUS_LOGISTICS",
   "GOVERNOR_PROMOTION_RESOURCE_MANAGER_EXPEDITION",
   "GOVERNOR_PROMOTION_RESOURCE_MANAGER_INDUSTRIALIST",
   "GOVERNOR_PROMOTION_RESOURCE_MANAGER_BLACK_MARKETEER",
   "GOVERNOR_PROMOTION_RESOURCE_MANAGER_VERTICAL_INTEGRATION"
  ],
  "modifiers": [
   {
    "id": "GROUNDBREAKER_BONUS_HARVEST_YIELDS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_RESOURCE_HARVEST_BONUS",
    "args": {
     "Amount": "50"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_THE_BUILDER",
  "identityPressure": 8,
  "assignCityState": false,
  "assignToMajor": false,
  "trait": null,
  "promotions": [
   "GOVERNOR_PROMOTION_BUILDER_GUILDMASTER",
   "GOVERNOR_PROMOTION_ZONING_COMMISSIONER",
   "GOVERNOR_PROMOTION_AQUACULTURE",
   "GOVERNOR_PROMOTION_REINFORCED_INFRASTRUCTURE",
   "GOVERNOR_PROMOTION_WATER_WORKS",
   "GOVERNOR_PROMOTION_PARKS_RECREATION"
  ],
  "modifiers": [
   {
    "id": "GUILDMASTER_ADDITIONAL_BUILDER_CHARGES",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "GUILDMASTER_ADDITIONAL_BUILDER_CHARGES_UNIT_MODIFIER"
    },
    "attach": {
     "id": "GUILDMASTER_ADDITIONAL_BUILDER_CHARGES_UNIT_MODIFIER",
     "collection": "COLLECTION_CITY_TRAINED_UNITS",
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
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_THE_EDUCATOR",
  "identityPressure": 8,
  "assignCityState": false,
  "assignToMajor": false,
  "trait": null,
  "promotions": [
   "GOVERNOR_PROMOTION_EDUCATOR_LIBRARIAN",
   "GOVERNOR_PROMOTION_EDUCATOR_CONNOISSEUR",
   "GOVERNOR_PROMOTION_EDUCATOR_RESEARCHER",
   "GOVERNOR_PROMOTION_EDUCATOR_GRANTS",
   "GOVERNOR_PROMOTION_MERCHANT_CURATOR",
   "GOVERNOR_PROMOTION_EDUCATOR_SPACE_INITIATIVE"
  ],
  "modifiers": [
   {
    "id": "LIBRARIAN_SCIENCE_YIELD_BONUS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "Amount": "15",
     "YieldType": "YIELD_SCIENCE"
    }
   },
   {
    "id": "LIBRARIAN_CULTURE_YIELD_BONUS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "Amount": "15",
     "YieldType": "YIELD_CULTURE"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_THE_MERCHANT",
  "identityPressure": 8,
  "assignCityState": false,
  "assignToMajor": false,
  "trait": null,
  "promotions": [
   "GOVERNOR_PROMOTION_MERCHANT_LAND_ACQUISITION",
   "GOVERNOR_PROMOTION_MERCHANT_HARBORMASTER",
   "GOVERNOR_PROMOTION_MERCHANT_FORESTRY_MANAGEMENT",
   "GOVERNOR_PROMOTION_MERCHANT_TAX_COLLECTOR",
   "GOVERNOR_PROMOTION_MERCHANT_CONTRACTOR",
   "GOVERNOR_PROMOTION_MERCHANT_RENEWABLE_ENERGY"
  ],
  "modifiers": [
   {
    "id": "LAND_ACQUISITION_FASTER_PLOT_ANNEXING",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_CULTURE_BORDER_EXPANSION",
    "args": {
     "Amount": "20"
    }
   },
   {
    "id": "FOREIGN_EXCHANGE_GOLD_FROM_FOREIGN_TRADE_PASSING_THROUGH",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_YIELD_FROM_FOREIGN_TRADE_ROUTES_PASSING_THROUGH",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "3"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_IBRAHIM",
  "identityPressure": 8,
  "assignCityState": true,
  "assignToMajor": true,
  "trait": "TRAIT_LEADER_SULEIMAN_GOVERNOR",
  "promotions": [
   "GOVERNOR_PROMOTION_PASHA",
   "GOVERNOR_PROMOTION_HEAD_FALCONER",
   "GOVERNOR_PROMOTION_SERASKER",
   "GOVERNOR_PROMOTION_KHASS_ODA_BASHI",
   "GOVERNOR_PROMOTION_CAPOU_AGHA",
   "GOVERNOR_PROMOTION_GRAND_VISIER"
  ],
  "modifiers": [
   {
    "id": "PASHA_BONUS_UNIT_PRODUCTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_ALL_MILITARY_UNITS_PRODUCTION",
    "args": {
     "Amount": "20"
    }
   }
  ]
 }
];
export const AI_GOVERNOR_PROMOTIONS: readonly AiGovernorPromotion[] = [
 {
  "type": "GOVERNOR_PROMOTION_REDOUBT",
  "level": 0,
  "baseAbility": true,
  "governors": [
   "GOVERNOR_THE_DEFENDER"
  ],
  "modifiers": [
   {
    "id": "DEFENDER_ADJUST_CITY_DEFENSE_STRENGTH",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_INNER_DEFENSE",
    "args": {
     "Amount": "5"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_GARRISON_COMMANDER",
  "level": 1,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_DEFENDER"
  ],
  "modifiers": [
   {
    "id": "GARRISON_COMMANDER_ADJUST_CITY_COMBAT_BONUS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_COMBAT_BONUS",
    "args": {
     "Amount": "5"
    }
   },
   {
    "id": "PRESTIGE_IDENTITY_PRESSURE_TO_DOMESTIC_CITIES",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_GOVERNOR_IDENTITY_PRESSURE",
    "args": {
     "Amount": "4",
     "DomesticCities": "true"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_DEFENSE_LOGISTICS",
  "level": 1,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_DEFENDER"
  ],
  "modifiers": [
   {
    "id": "DEFENSE_LOGISTICS_BONUS_STRATEGICS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_EXTRA_ACCUMULATION",
    "args": {
     "Amount": "1"
    }
   },
   {
    "id": "DEFENSE_LOGISTICS_SIEGE_PROTECTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_SIEGE_PROTECTION",
    "args": {
     "Protected": "true"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_EMBRASURE",
  "level": 2,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_DEFENDER"
  ],
  "modifiers": [
   {
    "id": "CITY_DEFENDER_ADJUST_ATTACKS_PER_TURN",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_ATTACKS_PER_TURN",
    "args": {
     "Amount": "1"
    }
   },
   {
    "id": "CITY_DEFENDER_FREE_PROMOTIONS",
    "collection": "COLLECTION_CITY_TRAINED_UNITS",
    "effect": "EFFECT_ADJUST_UNIT_GRANT_EXPERIENCE",
    "args": {
     "Amount": "-1"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_AIR_DEFENSE_INITIATIVE",
  "level": 3,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_DEFENDER"
  ],
  "modifiers": [
   {
    "id": "AIR_DEFENSE_INITIATIVE_ANTI_AIR_BONUS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_AIR_DEFENSE_BONUS",
    "args": {
     "Amount": "25"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_EDUCATOR_ARMS_RACE_PROPONENT",
  "level": 3,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_DEFENDER"
  ],
  "modifiers": [
   {
    "id": "EDUCATOR_FASTER_MANHATTAN_PROJECT_RESEARCH",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PROJECT_PRODUCTION",
    "args": {
     "ProjectType": "PROJECT_MANHATTAN_PROJECT",
     "Amount": "30"
    }
   },
   {
    "id": "EDUCATOR_FASTER_NUCLEAR_DEVICE_PRODUCTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PROJECT_PRODUCTION",
    "args": {
     "ProjectType": "PROJECT_BUILD_NUCLEAR_DEVICE",
     "Amount": "30"
    }
   },
   {
    "id": "EDUCATOR_FASTER_OPERATION_IVY_RESEARCH",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PROJECT_PRODUCTION",
    "args": {
     "ProjectType": "PROJECT_OPERATION_IVY",
     "Amount": "30"
    }
   },
   {
    "id": "EDUCATOR_FASTER_THERMONUCLEAR_DEVICE_PRODUCTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PROJECT_PRODUCTION",
    "args": {
     "ProjectType": "PROJECT_BUILD_THERMONUCLEAR_DEVICE",
     "Amount": "30"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_AMBASSADOR_MESSENGER",
  "level": 0,
  "baseAbility": true,
  "governors": [
   "GOVERNOR_THE_AMBASSADOR"
  ],
  "modifiers": [
   {
    "id": "MESSENGER_GRANT_FREE_ENVOYS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GOVERNOR_ADJUST_CITY_TOKENS_GRANTED",
    "args": {
     "Amount": "2"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_AMBASSADOR_EMISSARY",
  "level": 1,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_AMBASSADOR"
  ],
  "modifiers": [
   {
    "id": "EMISSARY_IDENTITY_PRESSURE_TO_FOREIGN_CITIES",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_GOVERNOR_IDENTITY_PRESSURE",
    "args": {
     "Amount": "2",
     "ForeignCities": "true"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_AMBASSADOR_AFFLUENCE",
  "level": 1,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_AMBASSADOR"
  ],
  "modifiers": [
   {
    "id": "AFFLUENCE_COPY_LUXURIES_FOR_IMPORT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GOVERNOR_ADJUST_CITY_COPY_LUXURIES_FOR_IMPORT",
    "args": {}
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_LOCAL_INFORMANTS",
  "level": 2,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_AMBASSADOR"
  ],
  "modifiers": [
   {
    "id": "LOCAL_INFORMANTS_SPY_DEFENSE_BONUS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_SPY_BONUS",
    "args": {
     "Amount": "3"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_AMBASSADOR_FOREIGN_INVESTOR",
  "level": 2,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_AMBASSADOR"
  ],
  "modifiers": [
   {
    "id": "FOREIGN_INVESTOR_COPY_STRATEGICS_FOR_IMPORT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GOVERNOR_ADJUST_CITY_COPY_STRATEGICS_FOR_IMPORT",
    "args": {}
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_AMBASSADOR_PUPPETEER",
  "level": 3,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_AMBASSADOR"
  ],
  "modifiers": [
   {
    "id": "AMBASSADOR_ADJUST_CITY_ENVOY_MODIFIER",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GOVERNOR_ADJUST_CITY_TOKENS_GRANTED_MODIFIER",
    "args": {
     "Percent": "100"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_CARDINAL_BISHOP",
  "level": 0,
  "baseAbility": true,
  "governors": [
   "GOVERNOR_THE_CARDINAL"
  ],
  "modifiers": [
   {
    "id": "CARDINAL_BISHOP_FAITH_DISTRICT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_YIELD_PER_DISTRICT",
    "args": {
     "YieldType": "YIELD_FAITH",
     "Amount": "2"
    }
   },
   {
    "id": "CARDINAL_BISHOP_PRESSURE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_RELIGION_PRESSURE",
    "args": {
     "Amount": "100"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_CARDINAL_GRAND_INQUISITOR",
  "level": 1,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_CARDINAL"
  ],
  "modifiers": [
   {
    "id": "CARDINAL_GRAND_INQUISITOR_COMBAT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_RELIGIOUS_COMBAT_BONUS",
    "args": {
     "Amount": "10"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_CARDINAL_LAYING_ON_OF_HANDS",
  "level": 1,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_CARDINAL"
  ],
  "modifiers": [
   {
    "id": "CARDINAL_LAYING_ON_OF_HANDS_HEAL",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_EXTRA_HEAL_GOVERNOR",
    "args": {
     "Amount": "100"
    }
   },
   {
    "id": "CARDINAL_LAYING_ON_OF_HANDS_RELIGIOUS_HEAL",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_RELIGIOUS_HEAL",
    "args": {
     "Amount": "100"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_CARDINAL_CITADEL_OF_GOD",
  "level": 2,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_CARDINAL"
  ],
  "modifiers": [
   {
    "id": "CARDINAL_CITADEL_OF_GOD_COMBAT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_RELIGION_IGNORE_COMBAT",
    "args": {
     "Enable": "true"
    }
   },
   {
    "id": "CARDINAL_CITADEL_OF_GOD_FAITH_FINISH_BUILDINGS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GRANT_CITY_YIELD_PERCENT_BUILDING_CREATED_COST",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingProductionPercent": "25",
     "IncludeWonder": "false"
    }
   },
   {
    "id": "CARDINAL_CITADEL_OF_GOD_PRESSURE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_RELIGION_IGNORE_PRESSURE",
    "args": {
     "Enable": "true"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_CARDINAL_PATRON_SAINT",
  "level": 3,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_CARDINAL"
  ],
  "modifiers": [
   {
    "id": "CARDINAL_PATRON_SAINT_PROMOTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_RELIGION_EXTRA_PROMOTIONS",
    "args": {
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_CARDINAL_DIVINE_ARCHITECT",
  "level": 3,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_CARDINAL"
  ],
  "modifiers": [
   {
    "id": "CARDINAL_FAITH_PURCHASE_DISTRICT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CAN_FAITH_PURCHASE_DISTRICTS",
    "args": {
     "CanPurchase": "true"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_RESOURCE_MANAGER_GROUNDBREAKER",
  "level": 0,
  "baseAbility": true,
  "governors": [
   "GOVERNOR_THE_RESOURCE_MANAGER"
  ],
  "modifiers": [
   {
    "id": "GROUNDBREAKER_BONUS_HARVEST_YIELDS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_RESOURCE_HARVEST_BONUS",
    "args": {
     "Amount": "50"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_RESOURCE_MANAGER_SURPLUS_LOGISTICS",
  "level": 1,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_RESOURCE_MANAGER"
  ],
  "modifiers": [
   {
    "id": "SURPLUS_LOGISTICS_EXTRA_GROWTH",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_GROWTH",
    "args": {
     "Amount": "20"
    }
   },
   {
    "id": "SURPLUS_LOGISTICS_TRADE_ROUTE_FOOD",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_TRADE_ROUTE_YIELD_TO_OTHERS",
    "args": {
     "YieldType": "YIELD_FOOD",
     "Amount": "2",
     "Domestic": "true"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_RESOURCE_MANAGER_EXPEDITION",
  "level": 1,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_RESOURCE_MANAGER"
  ],
  "modifiers": [
   {
    "id": "EXPEDITION_ADJUST_SETTLERS_CONSUME_POPULATION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_SETTLER_CONSUME_POP",
    "args": {
     "Enabled": "false"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_RESOURCE_MANAGER_INDUSTRIALIST",
  "level": 2,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_RESOURCE_MANAGER"
  ],
  "modifiers": [
   {
    "id": "INDUSTRIALIST_COAL_POWER_PLANT_PRODUCTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "BuildingType": "BUILDING_COAL_POWER_PLANT",
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "2"
    }
   },
   {
    "id": "INDUSTRIALIST_NUCLEAR_POWER_PLANT_PRODUCTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "BuildingType": "BUILDING_POWER_PLANT",
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "2"
    }
   },
   {
    "id": "INDUSTRIALIST_OIL_POWER_PLANT_PRODUCTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "BuildingType": "BUILDING_FOSSIL_FUEL_POWER_PLANT",
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "2"
    }
   },
   {
    "id": "INDUSTRIALIST_RESOURCE_POWER_PROVIDED",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_RESOURCE_POWER_PROVIDED_GOVERNOR",
    "args": {
     "Amount": "1"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_RESOURCE_MANAGER_BLACK_MARKETEER",
  "level": 2,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_RESOURCE_MANAGER"
  ],
  "modifiers": [
   {
    "id": "BLACK_MARKETEER_STRATEGIC_RESOURCE_COST_DISCOUNT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_STRATEGIC_RESOURCE_REQUIREMENT_MODIFIER",
    "args": {
     "Amount": "80"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_RESOURCE_MANAGER_VERTICAL_INTEGRATION",
  "level": 3,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_RESOURCE_MANAGER"
  ],
  "modifiers": [
   {
    "id": "VERTICAL_INTEGRATION_PRODUCTION_REGIONAL_STACKING",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_ALLOWED_INCOMING_REGIONAL_STACKING",
    "args": {
     "YieldType": "YIELD_PRODUCTION"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_BUILDER_GUILDMASTER",
  "level": 0,
  "baseAbility": true,
  "governors": [
   "GOVERNOR_THE_BUILDER"
  ],
  "modifiers": [
   {
    "id": "GUILDMASTER_ADDITIONAL_BUILDER_CHARGES",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ATTACH_MODIFIER",
    "args": {
     "ModifierId": "GUILDMASTER_ADDITIONAL_BUILDER_CHARGES_UNIT_MODIFIER"
    },
    "attach": {
     "id": "GUILDMASTER_ADDITIONAL_BUILDER_CHARGES_UNIT_MODIFIER",
     "collection": "COLLECTION_CITY_TRAINED_UNITS",
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
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_ZONING_COMMISSIONER",
  "level": 1,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_BUILDER"
  ],
  "modifiers": [
   {
    "id": "ZONING_COMMISSIONER_FASTER_DISTRICT_CONSTRUCTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_ALL_DISTRICTS_PRODUCTION",
    "args": {
     "Amount": "20"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_AQUACULTURE",
  "level": 1,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_BUILDER"
  ],
  "modifiers": [
   {
    "id": "AQUACULTURE_CAN_BUILD_FISHERY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_ALLOWED_IMPROVEMENT",
    "args": {
     "ImprovementType": "IMPROVEMENT_FISHERY"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_REINFORCED_INFRASTRUCTURE",
  "level": 2,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_BUILDER"
  ],
  "modifiers": [
   {
    "id": "REINFORCED_INFRASTRUCTURE_PREVENET_STRUCTURAL_DAMAGE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PREVENT_STRUCTURAL_DAMAGE",
    "args": {
     "Prevent": "true"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_WATER_WORKS",
  "level": 2,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_BUILDER"
  ],
  "modifiers": [
   {
    "id": "WATER_WORKS_AQUEDUCT_HOUSING",
    "collection": "COLLECTION_CITY_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_HOUSING",
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
        "DistrictType": "DISTRICT_AQUEDUCT"
       }
      }
     ]
    }
   },
   {
    "id": "WATER_WORKS_CANAL_AMENITY",
    "collection": "COLLECTION_CITY_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_AMENITY",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_DISTRICT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_CANAL"
       }
      }
     ]
    }
   },
   {
    "id": "WATER_WORKS_DAM_AMENITY",
    "collection": "COLLECTION_CITY_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_AMENITY",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_DISTRICT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_DAM"
       }
      }
     ]
    }
   },
   {
    "id": "WATER_WORKS_NEIGHBORHOOD_HOUSING",
    "collection": "COLLECTION_CITY_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_HOUSING",
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
        "DistrictType": "DISTRICT_NEIGHBORHOOD"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_PARKS_RECREATION",
  "level": 3,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_BUILDER"
  ],
  "modifiers": [
   {
    "id": "PARKS_RECREATION_CAN_BUILD_CITY_PARK",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_ALLOWED_IMPROVEMENT",
    "args": {
     "ImprovementType": "IMPROVEMENT_CITY_PARK"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_EDUCATOR_LIBRARIAN",
  "level": 0,
  "baseAbility": true,
  "governors": [
   "GOVERNOR_THE_EDUCATOR"
  ],
  "modifiers": [
   {
    "id": "LIBRARIAN_CULTURE_YIELD_BONUS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "Amount": "15",
     "YieldType": "YIELD_CULTURE"
    }
   },
   {
    "id": "LIBRARIAN_SCIENCE_YIELD_BONUS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "Amount": "15",
     "YieldType": "YIELD_SCIENCE"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_EDUCATOR_CONNOISSEUR",
  "level": 1,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_EDUCATOR"
  ],
  "modifiers": [
   {
    "id": "CONNOISSEUR_CULTURE_CITIZEN",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_YIELD_PER_POPULATION",
    "args": {
     "Amount": "1",
     "YieldType": "YIELD_CULTURE"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_EDUCATOR_RESEARCHER",
  "level": 1,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_EDUCATOR"
  ],
  "modifiers": [
   {
    "id": "RESEARCHER_SCIENCE_CITIZEN",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_YIELD_PER_POPULATION",
    "args": {
     "Amount": "1",
     "YieldType": "YIELD_SCIENCE"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_EDUCATOR_GRANTS",
  "level": 2,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_EDUCATOR"
  ],
  "modifiers": [
   {
    "id": "EDUCATOR_INCREASE_CITY_GREAT_PERSON_POINT_BONUS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_GREAT_PERSON_POINTS_MODIFIER",
    "args": {
     "Amount": "100"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_MERCHANT_CURATOR",
  "level": 3,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_EDUCATOR"
  ],
  "modifiers": [
   {
    "id": "CURATOR_DOUBLE_LANDSCAPE_TOURISM",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_TOURISM",
    "args": {
     "GreatWorkObjectType": "GREATWORKOBJECT_LANDSCAPE",
     "ScalingFactor": "200"
    }
   },
   {
    "id": "CURATOR_DOUBLE_MUSIC_TOURISM",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_TOURISM",
    "args": {
     "GreatWorkObjectType": "GREATWORKOBJECT_MUSIC",
     "ScalingFactor": "200"
    }
   },
   {
    "id": "CURATOR_DOUBLE_PORTRAIT_TOURISM",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_TOURISM",
    "args": {
     "GreatWorkObjectType": "GREATWORKOBJECT_PORTRAIT",
     "ScalingFactor": "200"
    }
   },
   {
    "id": "CURATOR_DOUBLE_RELIGIOUS_TOURISM",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_TOURISM",
    "args": {
     "GreatWorkObjectType": "GREATWORKOBJECT_RELIGIOUS",
     "ScalingFactor": "200"
    }
   },
   {
    "id": "CURATOR_DOUBLE_SCULPTURE_TOURISM",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_TOURISM",
    "args": {
     "GreatWorkObjectType": "GREATWORKOBJECT_SCULPTURE",
     "ScalingFactor": "200"
    }
   },
   {
    "id": "CURATOR_DOUBLE_WRITING_TOURISM",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_TOURISM",
    "args": {
     "GreatWorkObjectType": "GREATWORKOBJECT_WRITING",
     "ScalingFactor": "200"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_EDUCATOR_SPACE_INITIATIVE",
  "level": 3,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_EDUCATOR"
  ],
  "modifiers": [
   {
    "id": "EDUCATOR_FASTER_SPACE_RACE_PRODUCTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_SPACE_RACE_PROJECTS_PRODUCTION",
    "args": {
     "Amount": "30"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_MERCHANT_LAND_ACQUISITION",
  "level": 0,
  "baseAbility": true,
  "governors": [
   "GOVERNOR_THE_MERCHANT"
  ],
  "modifiers": [
   {
    "id": "FOREIGN_EXCHANGE_GOLD_FROM_FOREIGN_TRADE_PASSING_THROUGH",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_YIELD_FROM_FOREIGN_TRADE_ROUTES_PASSING_THROUGH",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "3"
    }
   },
   {
    "id": "LAND_ACQUISITION_FASTER_PLOT_ANNEXING",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_CULTURE_BORDER_EXPANSION",
    "args": {
     "Amount": "20"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_MERCHANT_HARBORMASTER",
  "level": 1,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_MERCHANT"
  ],
  "modifiers": [
   {
    "id": "HARBORMASTER_BONUS_COMMERCIAL_HUB_ADJACENCY",
    "collection": "COLLECTION_CITY_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "100"
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
    "id": "HARBORMASTER_BONUS_HARBOR_ADJACENCY",
    "collection": "COLLECTION_CITY_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "100"
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
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_MERCHANT_FORESTRY_MANAGEMENT",
  "level": 1,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_MERCHANT"
  ],
  "modifiers": [
   {
    "id": "FORESTRY_MANAGEMENT_FEATURE_NO_IMPROVEMENT_APPEAL",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_FEATURE_NO_IMPROVEMENT_APPEAL_GOVERNOR",
    "args": {
     "Amount": "1"
    }
   },
   {
    "id": "FORESTRY_MANAGEMENT_FEATURE_NO_IMPROVEMENT_GOLD",
    "collection": "COLLECTION_CITY_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "Amount": "2",
     "YieldType": "YIELD_GOLD"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_HAS_ANY_IMPROVEMENT",
       "inverse": true,
       "args": {}
      },
      {
       "type": "REQUIREMENT_PLOT_HAS_ANY_FEATURE",
       "inverse": false,
       "args": {}
      }
     ]
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_MERCHANT_TAX_COLLECTOR",
  "level": 2,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_MERCHANT"
  ],
  "modifiers": [
   {
    "id": "TAX_COLLECTOR_ADJUST_CITIZEN_GPT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_GOLD_FROM_CITIZENS",
    "args": {
     "Amount": "2"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_MERCHANT_CONTRACTOR",
  "level": 3,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_MERCHANT"
  ],
  "modifiers": [
   {
    "id": "CONTRACTOR_ENABLE_DISTRICT_PURCHASE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_CAN_PURCHASE_DISTRICTS",
    "args": {
     "CanPurchase": "true"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_MERCHANT_RENEWABLE_ENERGY",
  "level": 3,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_THE_MERCHANT"
  ],
  "modifiers": [
   {
    "id": "RENEWABLE_ENERGY_IMPROVEMENT_BUILDING_GOLD",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "BuildingType": "BUILDING_HYDROELECTRIC_DAM",
     "YieldType": "YIELD_GOLD",
     "Amount": "2"
    }
   },
   {
    "id": "RENEWABLE_ENERGY_IMPROVEMENT_PLOTS_GOLD",
    "collection": "COLLECTION_CITY_PLOT_YIELDS",
    "effect": "EFFECT_ADJUST_PLOT_YIELD",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_IMPROVEMENT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "ImprovementType": "IMPROVEMENT_SOLAR_FARM"
       }
      },
      {
       "type": "REQUIREMENT_PLOT_IMPROVEMENT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "ImprovementType": "IMPROVEMENT_WIND_FARM"
       }
      },
      {
       "type": "REQUIREMENT_PLOT_IMPROVEMENT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "ImprovementType": "IMPROVEMENT_OFFSHORE_WIND_FARM"
       }
      },
      {
       "type": "REQUIREMENT_PLOT_IMPROVEMENT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "ImprovementType": "IMPROVEMENT_GEOTHERMAL_PLANT"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_PASHA",
  "level": 0,
  "baseAbility": true,
  "governors": [
   "GOVERNOR_IBRAHIM"
  ],
  "modifiers": [
   {
    "id": "PASHA_BONUS_UNIT_PRODUCTION",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_ALL_MILITARY_UNITS_PRODUCTION",
    "args": {
     "Amount": "20"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_HEAD_FALCONER",
  "level": 1,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_IBRAHIM"
  ],
  "modifiers": [
   {
    "id": "HEAD_FALCONER_ADJUST_CITY_COMBAT_BONUS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_FRIENDLY_COMBAT_BONUS",
    "args": {
     "Amount": "5"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_SERASKER",
  "level": 1,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_IBRAHIM"
  ],
  "modifiers": [
   {
    "id": "SERASKER_ADJUST_GOVERNOR_COMBAT_DISTRICT",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_ADJUST_UNIT_AGAINST_DISTRICT_COMBAT_BONUS",
    "args": {
     "Amount": "10"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLOT_ADJACENT_TO_OWNER",
       "inverse": false,
       "args": {
        "MinDistance": "0",
        "MaxDistance": "10"
       }
      }
     ]
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_KHASS_ODA_BASHI",
  "level": 2,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_IBRAHIM"
  ],
  "modifiers": [
   {
    "id": "KHASS_ODA_BASHI_ADJUST_ALLIANCE_POINTS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_GOVERNOR_ALLIANCE_POINTS",
    "args": {
     "Amount": "2"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_CAPOU_AGHA",
  "level": 2,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_IBRAHIM"
  ],
  "modifiers": [
   {
    "id": "CAPOU_AGHA_ADJUST_GRIEVANCES",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_GOVERNOR_GRIEVENCE_SCORE",
    "args": {
     "Score": "1",
     "Turns": "1"
    }
   }
  ]
 },
 {
  "type": "GOVERNOR_PROMOTION_GRAND_VISIER",
  "level": 3,
  "baseAbility": false,
  "governors": [
   "GOVERNOR_IBRAHIM"
  ],
  "modifiers": [
   {
    "id": "GRAND_VIZIER_ADJUST_IGNORE_CULTURAL_IDENTITY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_IGNORE_IDENTITY_PRESSURE",
    "args": {
     "Ignore": "true"
    }
   }
  ]
 }
];
