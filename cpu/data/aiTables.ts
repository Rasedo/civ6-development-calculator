/**
 * THE AI VALUE LAYER'S TABLES (cpu/core/aiValue.ts), written by
 * tools/install/ai_tables.py from the layered install (`--check` reports a
 * stale file): the yields' and pseudo-yields' DefaultValue, the great
 * person classes' pseudo-yields, the governments' InfluencePointsThreshold,
 * and the AI lists the weights sum: System Yields and YieldSensitivities by
 * trait — a leader's traits through its InheritFrom chain, a civilization's,
 * an agenda's (AgendaTraits) —, those and PseudoYields by strategy
 * (Strategy_Priorities).
 */
import type { AiModifier } from '../core/aiModifiers';
import type { AiListRef, AiListItem } from '../core/aiValue';

export const AI_YIELD_DEFAULT: Readonly<Record<string, number>> = {
 "YIELD_FOOD": 1.0,
 "YIELD_PRODUCTION": 1.0,
 "YIELD_GOLD": 0.5,
 "YIELD_SCIENCE": 1.0,
 "YIELD_CULTURE": 1.0,
 "YIELD_FAITH": 1.0
};
export const AI_PSEUDOYIELD_DEFAULT: Readonly<Record<string, number>> = {
 "PSEUDOYIELD_CLEAR_BANDIT_CAMPS": 0.5,
 "PSEUDOYIELD_ENVIRONMENT": 0.5,
 "PSEUDOYIELD_GPP_GENERAL": 0.5,
 "PSEUDOYIELD_GPP_ADMIRAL": 0.5,
 "PSEUDOYIELD_GPP_ENGINEER": 0.5,
 "PSEUDOYIELD_GPP_MERCHANT": 0.5,
 "PSEUDOYIELD_GPP_PROPHET": 0.5,
 "PSEUDOYIELD_GPP_SCIENTIST": 0.5,
 "PSEUDOYIELD_GPP_WRITER": 0.5,
 "PSEUDOYIELD_GPP_ARTIST": 0.5,
 "PSEUDOYIELD_GPP_MUSICIAN": 0.5,
 "PSEUDOYIELD_IMPROVEMENT": 3.0,
 "PSEUDOYIELD_INFLUENCE": 0.5,
 "PSEUDOYIELD_UNIT_ARCHAEOLOGIST": 4.0,
 "PSEUDOYIELD_UNIT_COMBAT": 1.0,
 "PSEUDOYIELD_UNIT_NAVAL_COMBAT": 1.0,
 "PSEUDOYIELD_UNIT_AIR_COMBAT": 3.0,
 "PSEUDOYIELD_UNIT_EXPLORER": 1.0,
 "PSEUDOYIELD_UNIT_SETTLER": 1.0,
 "PSEUDOYIELD_UNIT_RELIGIOUS": 1.0,
 "PSEUDOYIELD_UNIT_TRADE": 1.0,
 "PSEUDOYIELD_UNIT_SPY": 20.0,
 "PSEUDOYIELD_DISTRICT": 4.0,
 "PSEUDOYIELD_WONDER": 2.0,
 "PSEUDOYIELD_GREATWORK_SCULPTURE": 10.0,
 "PSEUDOYIELD_GREATWORK_PORTRAIT": 10.0,
 "PSEUDOYIELD_GREATWORK_LANDSCAPE": 10.0,
 "PSEUDOYIELD_GREATWORK_RELIGIOUS": 10.0,
 "PSEUDOYIELD_GREATWORK_ARTIFACT": 10.0,
 "PSEUDOYIELD_GREATWORK_WRITING": 10.0,
 "PSEUDOYIELD_GREATWORK_MUSIC": 10.0,
 "PSEUDOYIELD_GREATWORK_RELIC": 10.0,
 "PSEUDOYIELD_DIPLOMATIC_BONUS": 0.25,
 "PSEUDOYIELD_NUCLEAR_WEAPON": 25.0,
 "PSEUDOYIELD_RESOURCE_LUXURY": 1.5,
 "PSEUDOYIELD_SPACE_RACE": 100.0,
 "PSEUDOYIELD_CIVIC": 5.0,
 "PSEUDOYIELD_TECHNOLOGY": 5.0,
 "PSEUDOYIELD_TOURISM": 1.0,
 "PSEUDOYIELD_HAPPINESS": 1.0,
 "PSEUDOYIELD_STANDING_ARMY_NUMBER": 1.0,
 "PSEUDOYIELD_STANDING_ARMY_VALUE": 0.1,
 "PSEUDOYIELD_CITY_BASE": 450.0,
 "PSEUDOYIELD_CITY_DEFENSES": 200.0,
 "PSEUDOYIELD_CITY_DEFENDING_UNITS": 80.0,
 "PSEUDOYIELD_CITY_ORIGINAL_CAPITAL": 200.0,
 "PSEUDOYIELD_CITY_POPULATION": 50.0,
 "PSEUDOYIELD_GOLDENAGE_POINT": 1.0,
 "PSEUDOYIELD_GOVERNOR": 2.0,
 "PSEUDOYIELD_DIPLOMATIC_FAVOR": 0.7,
 "PSEUDOYIELD_DIPLOMATIC_VICTORY_POINT": 100.0,
 "PSEUDOYIELD_DIPLOMATIC_GRIEVANCE": -0.5,
 "PSEUDOYIELD_RELIGIOUS_CONVERT_EMPIRE": 1.0
};
export const AI_GP_CLASS_PSEUDOYIELD: Readonly<Record<string, string>> = {
 "GREAT_PERSON_CLASS_GENERAL": "PSEUDOYIELD_GPP_GENERAL",
 "GREAT_PERSON_CLASS_ADMIRAL": "PSEUDOYIELD_GPP_ADMIRAL",
 "GREAT_PERSON_CLASS_ENGINEER": "PSEUDOYIELD_GPP_ENGINEER",
 "GREAT_PERSON_CLASS_MERCHANT": "PSEUDOYIELD_GPP_MERCHANT",
 "GREAT_PERSON_CLASS_PROPHET": "PSEUDOYIELD_GPP_PROPHET",
 "GREAT_PERSON_CLASS_SCIENTIST": "PSEUDOYIELD_GPP_SCIENTIST",
 "GREAT_PERSON_CLASS_WRITER": "PSEUDOYIELD_GPP_WRITER",
 "GREAT_PERSON_CLASS_ARTIST": "PSEUDOYIELD_GPP_ARTIST",
 "GREAT_PERSON_CLASS_MUSICIAN": "PSEUDOYIELD_GPP_MUSICIAN",
 "GREAT_PERSON_CLASS_COMANDANTE_GENERAL": "PSEUDOYIELD_GPP_GENERAL"
};
export const AI_GOVERNMENT_INFLUENCE_THRESHOLD: Readonly<Record<string, number>> = {
 "GOVERNMENT_CHIEFDOM": 100,
 "GOVERNMENT_AUTOCRACY": 100,
 "GOVERNMENT_OLIGARCHY": 100,
 "GOVERNMENT_CLASSICAL_REPUBLIC": 100,
 "GOVERNMENT_MONARCHY": 150,
 "GOVERNMENT_THEOCRACY": 150,
 "GOVERNMENT_MERCHANT_REPUBLIC": 150,
 "GOVERNMENT_FASCISM": 200,
 "GOVERNMENT_COMMUNISM": 200,
 "GOVERNMENT_DEMOCRACY": 200,
 "GOVERNMENT_CORPORATE_LIBERTARIANISM": 250,
 "GOVERNMENT_DIGITAL_DEMOCRACY": 250,
 "GOVERNMENT_SYNTHETIC_TECHNOCRACY": 250
};
export const AI_LIST_ITEMS: Readonly<Record<string, readonly AiListItem[]>> = {
 "AncientPseudoYields": [
  {
   "item": "PSEUDOYIELD_DIPLOMATIC_FAVOR",
   "value": -100,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "AvoidDarkAges": [
  {
   "item": "PSEUDOYIELD_GOLDENAGE_POINT",
   "value": 500,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "BasilFavoredYields": [
  {
   "item": "YIELD_FAITH",
   "value": 33,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "ClassicalPseudoYields": [
  {
   "item": "PSEUDOYIELD_GPP_MERCHANT",
   "value": 20,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "ClassicalSensitivity": [
  {
   "item": "YIELD_SCIENCE",
   "value": 10,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "ClassicalYields": [
  {
   "item": "YIELD_FAITH",
   "value": 20,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "YIELD_FOOD",
   "value": 15,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "YIELD_GOLD",
   "value": 20,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "YIELD_SCIENCE",
   "value": 30,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "CultureLoverCulturePreference": [
  {
   "item": "YIELD_CULTURE",
   "value": 20,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "CultureSensitivity": [
  {
   "item": "YIELD_CULTURE",
   "value": 25,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "CultureVictoryPseudoYields": [
  {
   "item": "PSEUDOYIELD_GPP_WRITER",
   "value": 50,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GPP_ARTIST",
   "value": 50,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GPP_MUSICIAN",
   "value": 50,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_TOURISM",
   "value": 75,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GREATWORK_SCULPTURE",
   "value": 20,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GREATWORK_PORTRAIT",
   "value": 20,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GREATWORK_LANDSCAPE",
   "value": 20,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GREATWORK_RELIGIOUS",
   "value": 20,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GREATWORK_ARTIFACT",
   "value": 20,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GREATWORK_WRITING",
   "value": 20,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GREATWORK_MUSIC",
   "value": 20,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "CultureVictoryYields": [
  {
   "item": "YIELD_CULTURE",
   "value": 25,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "DefaultYieldBias": [
  {
   "item": "YIELD_PRODUCTION",
   "value": 25,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "YIELD_SCIENCE",
   "value": 10,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "YIELD_CULTURE",
   "value": 10,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "YIELD_GOLD",
   "value": 20,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "YIELD_FAITH",
   "value": -25,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "DiplomaticPseudoYieldPreferences": [
  {
   "item": "PSEUDOYIELD_DIPLOMATIC_FAVOR",
   "value": 100,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_DIPLOMATIC_VICTORY_POINT",
   "value": 100,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "ElizabethYields": [
  {
   "item": "YIELD_GOLD",
   "value": 25,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "EthiopiaYields": [
  {
   "item": "YIELD_FAITH",
   "value": 20,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "ExpansionUnitPreferences": [
  {
   "item": "PSEUDOYIELD_UNIT_COMBAT",
   "value": -25,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_UNIT_NAVAL_COMBAT",
   "value": -25,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_UNIT_SETTLER",
   "value": 25,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "FaithLoverFaithPreference": [
  {
   "item": "YIELD_FAITH",
   "value": 20,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "FoodLoverFoodPreference": [
  {
   "item": "YIELD_FOOD",
   "value": 20,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "GilgameshSciencePreference": [
  {
   "item": "YIELD_SCIENCE",
   "value": 10,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "GreeceYields": [
  {
   "item": "YIELD_CULTURE",
   "value": 20,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "IndustrialPseudoYields": [
  {
   "item": "PSEUDOYIELD_GPP_ENGINEER",
   "value": 20,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GPP_SCIENTIST",
   "value": 20,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GPP_ADMIRAL",
   "value": 50,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GPP_ENGINEER",
   "value": 50,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GPP_GENERAL",
   "value": 50,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GPP_SCIENTIST",
   "value": 50,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GPP_ARTIST",
   "value": 25,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GPP_MUSICIAN",
   "value": 25,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GPP_WRITER",
   "value": 25,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "IndustrialRevolutionPreference": [
  {
   "item": "YIELD_PRODUCTION",
   "value": 20,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "IndustrialYields": [
  {
   "item": "YIELD_FAITH",
   "value": -40,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "YIELD_GOLD",
   "value": 15,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "IndustryLoverIndustryPreference": [
  {
   "item": "YIELD_PRODUCTION",
   "value": 20,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "KoreaScienceBiase": [
  {
   "item": "YIELD_SCIENCE",
   "value": 50,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "KublaiKhanYieldPreferences": [
  {
   "item": "YIELD_GOLD",
   "value": 20,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LordOfMinesYields": [
  {
   "item": "YIELD_GOLD",
   "value": 25,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "LowReligiousPreferenceYields": [
  {
   "item": "YIELD_FAITH",
   "value": -50,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "MansaMusaGold": [
  {
   "item": "YIELD_GOLD",
   "value": 20,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "MayanObservatory": [
  {
   "item": "YIELD_SCIENCE",
   "value": 25,
   "favored": false,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "MedievalPseudoYields": [
  {
   "item": "PSEUDOYIELD_GPP_ENGINEER",
   "value": 20,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GPP_MERCHANT",
   "value": 20,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GPP_SCIENTIST",
   "value": 30,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_DIPLOMATIC_FAVOR",
   "value": 100,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "MedievalSensitivity": [
  {
   "item": "YIELD_CULTURE",
   "value": 10,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "MedievalYields": [
  {
   "item": "YIELD_FAITH",
   "value": -25,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "YIELD_FOOD",
   "value": 25,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "YIELD_GOLD",
   "value": 15,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "YIELD_PRODUCTION",
   "value": 20,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "YIELD_SCIENCE",
   "value": 15,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "MilitaryVictoryPseudoYields": [
  {
   "item": "PSEUDOYIELD_CITY_DEFENSES",
   "value": -25,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_CITY_ORIGINAL_CAPITAL",
   "value": 100,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_DIPLOMATIC_BONUS",
   "value": -50,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_NUCLEAR_WEAPON",
   "value": 25,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_UNIT_COMBAT",
   "value": 25,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_UNIT_NAVAL_COMBAT",
   "value": 25,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_UNIT_AIR_COMBAT",
   "value": 25,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GPP_ADMIRAL",
   "value": 50,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GPP_GENERAL",
   "value": 50,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "MilitaryVictoryYields": [
  {
   "item": "YIELD_PRODUCTION",
   "value": 25,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "ModernPseudoYields": [
  {
   "item": "PSEUDOYIELD_GPP_ADMIRAL",
   "value": 50,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GPP_ENGINEER",
   "value": 50,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GPP_GENERAL",
   "value": 50,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GPP_SCIENTIST",
   "value": 50,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GPP_ARTIST",
   "value": 25,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GPP_MUSICIAN",
   "value": 25,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GPP_WRITER",
   "value": 25,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "ModernSensitivity": [
  {
   "item": "YIELD_SCIENCE",
   "value": 10,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "YIELD_CULTURE",
   "value": 10,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "ModernYields": [
  {
   "item": "YIELD_FOOD",
   "value": 5,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "YIELD_GOLD",
   "value": 10,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "MoneyGrubberGoldPreference": [
  {
   "item": "YIELD_GOLD",
   "value": 20,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "NavalUnitPreferences": [
  {
   "item": "PSEUDOYIELD_UNIT_NAVAL_COMBAT",
   "value": 150,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_UNIT_COMBAT",
   "value": -90,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "NewRomeCulturePreference": [
  {
   "item": "YIELD_CULTURE",
   "value": 20,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "ReligiousVictoryPseudoYields": [
  {
   "item": "PSEUDOYIELD_GPP_PROPHET",
   "value": 25,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_UNIT_RELIGIOUS",
   "value": 50,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_RELIGIOUS_CONVERT_EMPIRE",
   "value": 100,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "ReligiousVictoryYields": [
  {
   "item": "YIELD_FAITH",
   "value": 75,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "RenaissancePseudoYields": [
  {
   "item": "PSEUDOYIELD_GPP_PROPHET",
   "value": -100,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GPP_ENGINEER",
   "value": 20,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GPP_ARTIST",
   "value": 10,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GPP_WRITER",
   "value": 10,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GPP_SCIENTIST",
   "value": 30,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "RenaissanceYields": [
  {
   "item": "YIELD_FOOD",
   "value": 10,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "YIELD_GOLD",
   "value": 15,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "ScienceLoverSciencePreference": [
  {
   "item": "YIELD_SCIENCE",
   "value": 20,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "ScienceSensitivity": [
  {
   "item": "YIELD_SCIENCE",
   "value": 25,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "ScienceVictoryPseudoYields": [
  {
   "item": "PSEUDOYIELD_SPACE_RACE",
   "value": 100,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_TECHNOLOGY",
   "value": 25,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  },
  {
   "item": "PSEUDOYIELD_GPP_SCIENTIST",
   "value": 25,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "ScienceVictoryYields": [
  {
   "item": "YIELD_SCIENCE",
   "value": 50,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "TamarYields": [
  {
   "item": "YIELD_FAITH",
   "value": 20,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "WilhelminaYields": [
  {
   "item": "YIELD_GOLD",
   "value": 25,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "WonderObsessedIndustrialBonus": [
  {
   "item": "PSEUDOYIELD_WONDER",
   "value": 100,
   "favored": true,
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ]
};
export const AI_TRAIT_LISTS: Readonly<Record<string, readonly AiListRef[]>> = {
 "TRAIT_AGENDA_BASIL_ZEALOT": [
  {
   "list": "BasilFavoredYields",
   "system": "Yields",
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "TRAIT_AGENDA_BILLIONAIRE": [
  {
   "list": "WilhelminaYields",
   "system": "Yields",
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "TRAIT_AGENDA_LORD_OF_MINES": [
  {
   "list": "LordOfMinesYields",
   "system": "Yields",
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "TRAIT_AGENDA_NARIKALA_FORTRESS": [
  {
   "list": "TamarYields",
   "system": "Yields",
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "TRAIT_AGENDA_NEW_ROME": [
  {
   "list": "NewRomeCulturePreference",
   "system": "Yields",
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "TRAIT_AGENDA_PREFER_CULTURE": [
  {
   "list": "CultureLoverCulturePreference",
   "system": "Yields",
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "TRAIT_AGENDA_PREFER_FAITH": [
  {
   "list": "FaithLoverFaithPreference",
   "system": "Yields",
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "TRAIT_AGENDA_PREFER_FOOD": [
  {
   "list": "FoodLoverFoodPreference",
   "system": "Yields",
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "TRAIT_AGENDA_PREFER_INCOME": [
  {
   "list": "MoneyGrubberGoldPreference",
   "system": "Yields",
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "TRAIT_AGENDA_PREFER_INDUSTRIAL_REVOLUTION": [
  {
   "list": "IndustrialRevolutionPreference",
   "system": "Yields",
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "TRAIT_AGENDA_PREFER_INDUSTRY": [
  {
   "list": "IndustryLoverIndustryPreference",
   "system": "Yields",
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "TRAIT_AGENDA_PREFER_SCIENCE": [
  {
   "list": "ScienceLoverSciencePreference",
   "system": "Yields",
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "TRAIT_AGENDA_SAINT": [
  {
   "list": "FaithLoverFaithPreference",
   "system": "Yields",
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "TRAIT_AGENDA_TRADE_AGREEMENT": [
  {
   "list": "ElizabethYields",
   "system": "Yields",
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "TRAIT_CIVILIZATION_DISTRICT_ACROPOLIS": [
  {
   "list": "GreeceYields",
   "system": "Yields",
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "TRAIT_CIVILIZATION_DISTRICT_SEOWON": [
  {
   "list": "KoreaScienceBiase",
   "system": "Yields",
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "TRAIT_CIVILIZATION_IMPROVEMENT_ROCK_HEWN_CHURCH": [
  {
   "list": "EthiopiaYields",
   "system": "Yields",
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "TRAIT_CIVILIZATION_MAYAB": [
  {
   "list": "MayanObservatory",
   "system": "Yields",
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "TRAIT_LEADER_ADVENTURES_ENKIDU": [
  {
   "list": "GilgameshSciencePreference",
   "system": "Yields",
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "TRAIT_LEADER_KUBLAI": [
  {
   "list": "KublaiKhanYieldPreferences",
   "system": "Yields",
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "TRAIT_LEADER_LOW_RELIGIOUS_PREFERENCE": [
  {
   "list": "LowReligiousPreferenceYields",
   "system": "Yields",
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "TRAIT_LEADER_MAJOR_CIV": [
  {
   "list": "DefaultYieldBias",
   "system": "Yields",
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ],
 "TRAIT_LEADER_SAHEL_MERCHANTS": [
  {
   "list": "MansaMusaGold",
   "system": "Yields",
   "minDifficulty": null,
   "maxDifficulty": null
  }
 ]
};
export const AI_LEADER_TRAITS: Readonly<Record<string, readonly string[]>> = {
 "LEADER_ABRAHAM_LINCOLN": [
  "TRAIT_LEADER_LOW_RELIGIOUS_PREFERENCE",
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_ALEXANDER": [
  "TRAIT_LEADER_LOW_RELIGIOUS_PREFERENCE",
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_AMANITORE": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_AMBIORIX": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_BARBAROSSA": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_BASIL": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_CATHERINE_DE_MEDICI": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_CATHERINE_DE_MEDICI_ALT": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_CHANDRAGUPTA": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_CLEOPATRA": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_CLEOPATRA_ALT": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_CYRUS": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_DEFAULT": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_DIDO": [
  "TRAIT_LEADER_LOW_RELIGIOUS_PREFERENCE",
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_ELEANOR_ENGLAND": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_ELEANOR_FRANCE": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_ELIZABETH": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_GANDHI": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_GENGHIS_KHAN": [
  "TRAIT_LEADER_LOW_RELIGIOUS_PREFERENCE",
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_GILGAMESH": [
  "TRAIT_LEADER_ADVENTURES_ENKIDU",
  "TRAIT_LEADER_LOW_RELIGIOUS_PREFERENCE",
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_GITARJA": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_GORGO": [
  "TRAIT_LEADER_LOW_RELIGIOUS_PREFERENCE",
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_HAMMURABI": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_HARALD_ALT": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_HARDRADA": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_HOJO": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_JADWIGA": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_JAYAVARMAN": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_JOAO_III": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_JOHN_CURTIN": [
  "TRAIT_LEADER_LOW_RELIGIOUS_PREFERENCE",
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_JULIUS_CAESAR": [
  "TRAIT_LEADER_LOW_RELIGIOUS_PREFERENCE",
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_KRISTINA": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_KUBLAI_KHAN_CHINA": [
  "TRAIT_LEADER_KUBLAI",
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_KUBLAI_KHAN_MONGOLIA": [
  "TRAIT_LEADER_KUBLAI",
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_KUPE": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_LADY_SIX_SKY": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_LADY_TRIEU": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_LAURIER": [
  "TRAIT_LEADER_LOW_RELIGIOUS_PREFERENCE",
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_LAUTARO": [
  "TRAIT_LEADER_LOW_RELIGIOUS_PREFERENCE",
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_LUDWIG": [
  "TRAIT_LEADER_LOW_RELIGIOUS_PREFERENCE",
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_MANSA_MUSA": [
  "TRAIT_LEADER_SAHEL_MERCHANTS",
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_MATTHIAS_CORVINUS": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_MENELIK": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_MONTEZUMA": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_MVEMBA": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_NADER_SHAH": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_NZINGA_MBANDE": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_PACHACUTI": [
  "TRAIT_LEADER_LOW_RELIGIOUS_PREFERENCE",
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_PEDRO": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_PERICLES": [
  "TRAIT_LEADER_LOW_RELIGIOUS_PREFERENCE",
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_PETER_GREAT": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_PHILIP_II": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_POUNDMAKER": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_QIN": [
  "TRAIT_LEADER_LOW_RELIGIOUS_PREFERENCE",
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_QIN_ALT": [
  "TRAIT_LEADER_LOW_RELIGIOUS_PREFERENCE",
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_RAMSES": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_ROBERT_THE_BRUCE": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_SALADIN": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_SALADIN_ALT": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_SEJONG": [
  "TRAIT_LEADER_LOW_RELIGIOUS_PREFERENCE",
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_SEONDEOK": [
  "TRAIT_LEADER_LOW_RELIGIOUS_PREFERENCE",
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_SHAKA": [
  "TRAIT_LEADER_LOW_RELIGIOUS_PREFERENCE",
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_SIMON_BOLIVAR": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_SULEIMAN": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_SULEIMAN_ALT": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_SUNDIATA_KEITA": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_TAMAR": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_THEODORA": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_TOKUGAWA": [
  "TRAIT_LEADER_LOW_RELIGIOUS_PREFERENCE",
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_TOMYRIS": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_TRAJAN": [
  "TRAIT_LEADER_LOW_RELIGIOUS_PREFERENCE",
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_T_ROOSEVELT": [
  "TRAIT_LEADER_LOW_RELIGIOUS_PREFERENCE",
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_T_ROOSEVELT_ROUGHRIDER": [
  "TRAIT_LEADER_LOW_RELIGIOUS_PREFERENCE",
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_VICTORIA": [
  "TRAIT_LEADER_LOW_RELIGIOUS_PREFERENCE",
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_VICTORIA_ALT": [
  "TRAIT_LEADER_LOW_RELIGIOUS_PREFERENCE",
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_WILHELMINA": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_WU_ZETIAN": [
  "TRAIT_LEADER_MAJOR_CIV"
 ],
 "LEADER_YONGLE": [
  "TRAIT_LEADER_MAJOR_CIV"
 ]
};
export const AI_CIVILIZATION_TRAITS: Readonly<Record<string, readonly string[]>> = {
 "CIVILIZATION_ETHIOPIA": [
  "TRAIT_CIVILIZATION_IMPROVEMENT_ROCK_HEWN_CHURCH"
 ],
 "CIVILIZATION_GREECE": [
  "TRAIT_CIVILIZATION_DISTRICT_ACROPOLIS"
 ],
 "CIVILIZATION_KOREA": [
  "TRAIT_CIVILIZATION_DISTRICT_SEOWON"
 ],
 "CIVILIZATION_MAYA": [
  "TRAIT_CIVILIZATION_MAYAB"
 ]
};
export const AI_AGENDA_TRAITS: Readonly<Record<string, readonly string[]>> = {
 "AGENDA_AIRPOWER": [
  "TRAIT_AGENDA_PREFER_AIRPOWER"
 ],
 "AGENDA_ALLY_OF_ENKIDU": [
  "TRAIT_AGENDA_ALLY_OF_ENKIDU"
 ],
 "AGENDA_AMBIORIX_ARMY": [
  "TRAIT_AGENDA_AMBIORIX_ARMY",
  "TRAIT_LEADER_AGGRESSIVE_MILITARY"
 ],
 "AGENDA_ANGEVIN_EMPIRE": [
  "TRAIT_AGENDA_ANGEVIN_EMPIRE"
 ],
 "AGENDA_ARCHIPELAGIC_STATE": [
  "TRAIT_AGENDA_ARCHIPELAGIC_STATE"
 ],
 "AGENDA_AYYUBID_DYNASTY": [
  "TRAIT_AGENDA_AYYUBID_DYNASTY"
 ],
 "AGENDA_BACKSTABBER": [
  "TRAIT_AGENDA_BACKSTABBER"
 ],
 "AGENDA_BACKSTAB_AVERSE": [
  "TRAIT_AGENDA_BACKSTAB_AVERSE"
 ],
 "AGENDA_BARBARIAN_LOVER": [
  "TRAIT_AGENDA_BARBARIAN_LOVER"
 ],
 "AGENDA_BASIL_ZEALOT": [
  "TRAIT_AGENDA_BASIL_ZEALOT"
 ],
 "AGENDA_BIG_STICK_POLICY": [
  "TRAIT_AGENDA_BIG_STICK_POLICY"
 ],
 "AGENDA_BILLIONAIRE": [
  "TRAIT_AGENDA_BILLIONAIRE"
 ],
 "AGENDA_BLACK_QUEEN": [
  "TRAIT_AGENDA_BLACK_QUEEN"
 ],
 "AGENDA_BULL_MOOSE": [
  "TRAIT_AGENDA_BULL_MOOSE"
 ],
 "AGENDA_BUSHIDO": [
  "TRAIT_AGENDA_BUSHIDO"
 ],
 "AGENDA_CANADIAN_EXPEDITIONARY": [
  "TRAIT_AGENDA_CANADIAN_EXPEDITIONARY"
 ],
 "AGENDA_CHEOMSEONGDAE": [
  "TRAIT_AGENDA_CHEOMSEONGDAE"
 ],
 "AGENDA_CITY_PLANNER": [
  "TRAIT_AGENDA_CITY_PLANNER"
 ],
 "AGENDA_CITY_STATE_ALLY": [
  "TRAIT_AGENDA_CITY_STATE_ALLY"
 ],
 "AGENDA_CITY_STATE_PROTECTOR": [
  "TRAIT_AGENDA_PREFER_CITY_STATE_PROTECTOR"
 ],
 "AGENDA_CIVILIZED": [
  "TRAIT_AGENDA_PREFER_CLEAR_BANDIT_CAMPS"
 ],
 "AGENDA_COUNTER_REFORMER": [
  "TRAIT_AGENDA_COUNTER_REFORMER"
 ],
 "AGENDA_COURT_INTRIGUE": [
  "TRAIT_AGENDA_COURT_INTRIGUE"
 ],
 "AGENDA_CULTURED": [
  "TRAIT_AGENDA_PREFER_CULTURE"
 ],
 "AGENDA_DARWINIST": [
  "TRAIT_AGENDA_ENJOYS_WAR",
  "TRAIT_AGENDA_IGNORE_WARMONGERING"
 ],
 "AGENDA_DECOLONIZATION": [
  "TRAIT_AGENDA_DECOLONIZATION"
 ],
 "AGENDA_DELIAN_LEAGUE": [
  "TRAIT_AGENDA_DELIAN_LEAGUE"
 ],
 "AGENDA_DEMAGOGUE": [
  "TRAIT_AGENDA_PREFER_NOFAVOR"
 ],
 "AGENDA_DESTINATION_CIV": [
  "TRAIT_AGENDA_PREFER_NOTOURISM"
 ],
 "AGENDA_DEVOUT": [
  "TRAIT_AGENDA_PREFER_FAITH"
 ],
 "AGENDA_END_TO_SUFFERING": [
  "TRAIT_AGENDA_END_TO_SUFFERING"
 ],
 "AGENDA_ENTHUSIASTIC_DISCIPLE": [
  "TRAIT_AGENDA_ENTHUSIASTIC_DISCIPLE"
 ],
 "AGENDA_ENVIRONMENTALIST": [
  "TRAIT_AGENDA_PREFER_ENVIRONMENT"
 ],
 "AGENDA_ETERNAL": [
  "TRAIT_AGENDA_ETERNAL"
 ],
 "AGENDA_ETHIOPIAN_HIGHLANDS": [
  "TRAIT_AGENDA_ETHIOPIAN_HIGHLANDS"
 ],
 "AGENDA_EXPANSIONIST": [
  "TRAIT_AGENDA_EXPANSIONIST"
 ],
 "AGENDA_EXPLOITATIVE": [
  "TRAIT_AGENDA_PREFER_EXPLOITATION"
 ],
 "AGENDA_EXPLORER": [
  "TRAIT_AGENDA_EXPLORATION_OBSESSED"
 ],
 "AGENDA_FLAT_EARTHER": [
  "TRAIT_AGENDA_FLAT_EARTHER"
 ],
 "AGENDA_FLOWER_OF_SCOTLAND": [
  "TRAIT_AGENDA_FLOWER_OF_SCOTLAND"
 ],
 "AGENDA_FUN_LOVING": [
  "TRAIT_AGENDA_PREFER_HAPPINESS"
 ],
 "AGENDA_GALLIC_WARS": [
  "TRAIT_AGENDA_GALLIC_WARS"
 ],
 "AGENDA_GOLDEN_AGE": [
  "TRAIT_AGENDA_SYCOPHANT"
 ],
 "AGENDA_GOSSIP": [
  "TRAIT_AGENDA_GOSSIP"
 ],
 "AGENDA_GREAT_PERSON_ADVOCATE": [
  "TRAIT_AGENDA_GREAT_PERSON_ADVOCATE"
 ],
 "AGENDA_GREAT_PERSON_OBSESSED": [
  "TRAIT_AGENDA_GREAT_PERSON_OBSESSED"
 ],
 "AGENDA_GREAT_WHITE_FLEET": [
  "TRAIT_AGENDA_GREAT_WHITE_FLEET"
 ],
 "AGENDA_HAMMURABI_DISTRICTS": [
  "TRAIT_AGENDA_HAMMURABI_DISTRICTS"
 ],
 "AGENDA_HORN_CHEST_LOINS": [
  "TRAIT_AGENDA_HORN_CHEST_LOINS"
 ],
 "AGENDA_HORSE_LORD": [
  "TRAIT_AGENDA_HORSE_LORD"
 ],
 "AGENDA_IDEOLOGUE": [
  "TRAIT_AGENDA_PREFER_SAME_GOVERNMENT"
 ],
 "AGENDA_INDUSTRIALIST": [
  "TRAIT_AGENDA_PREFER_INDUSTRY"
 ],
 "AGENDA_INDUSTRIAL_REVOLUTION": [
  "TRAIT_AGENDA_INDUSTRIAL_REVOLUTION"
 ],
 "AGENDA_INTOLERANT": [
  "TRAIT_AGENDA_INTOLERANT"
 ],
 "AGENDA_IRON_CONFEDERACY": [
  "TRAIT_AGENDA_IRON_CONFEDERACY"
 ],
 "AGENDA_IRON_CROWN": [
  "TRAIT_AGENDA_IRON_CROWN"
 ],
 "AGENDA_JOAO_EXPLORER": [
  "TRAIT_JOAO_EXPLORATION_AGENDA"
 ],
 "AGENDA_KAITIAKITANGA": [
  "TRAIT_AGENDA_KAITIAKITANGA"
 ],
 "AGENDA_KUBLAI_PAX": [
  "TRAIT_AGENDA_KUBLAI_PAX"
 ],
 "AGENDA_LADY_SIX_SKY": [
  "TRAIT_AGENDA_LADY_SIX_SKY"
 ],
 "AGENDA_LAST_VIKING_KING": [
  "TRAIT_AGENDA_LAST_VIKING_KING"
 ],
 "AGENDA_LAWGIVER": [
  "TRAIT_AGENDA_LAWGIVER"
 ],
 "AGENDA_LIBERTARIAN": [
  "TRAIT_AGENDA_PREFER_NODIPLOVP"
 ],
 "AGENDA_LION_OF_MALI": [
  "TRAIT_AGENDA_LION_OF_MALI"
 ],
 "AGENDA_LORD_OF_MINES": [
  "TRAIT_AGENDA_LORD_OF_MINES"
 ],
 "AGENDA_MAAT": [
  "TRAIT_AGENDA_MAAT"
 ],
 "AGENDA_MAGNIFICENCES": [
  "TRAIT_AGENDA_MAGNIFICENCES"
 ],
 "AGENDA_MAURYA_EMPIRE": [
  "TRAIT_AGENDA_MAURYA_EMPIRE"
 ],
 "AGENDA_MONEY_GRUBBER": [
  "TRAIT_AGENDA_PREFER_INCOME"
 ],
 "AGENDA_NARIKALA_FORTRESS": [
  "TRAIT_AGENDA_NARIKALA_FORTRESS"
 ],
 "AGENDA_NATURALIST": [
  "TRAIT_AGENDA_NATURALIST"
 ],
 "AGENDA_NEW_ROME": [
  "TRAIT_AGENDA_NEW_ROME"
 ],
 "AGENDA_NUKE_LOVER": [
  "TRAIT_AGENDA_PREFER_NUKES"
 ],
 "AGENDA_OPTIMUS_PRINCEPS": [
  "TRAIT_AGENDA_OPTIMUS_PRINCEPS"
 ],
 "AGENDA_PARANOID": [
  "TRAIT_AGENDA_PARANOID"
 ],
 "AGENDA_PATRON_OF_ARTS": [
  "TRAIT_AGENDA_PATRON_OF_ARTS"
 ],
 "AGENDA_PEACEKEEPER": [
  "TRAIT_AGENDA_PEACEKEEPER"
 ],
 "AGENDA_PERPETUALLY_ON_GUARD": [
  "TRAIT_AGENDA_PERPETUALLY_ON_GUARD"
 ],
 "AGENDA_PILLAGER": [
  "TRAIT_AGENDA_PREFER_PILLAGE"
 ],
 "AGENDA_POPULOUS": [
  "TRAIT_AGENDA_PREFER_POPULATION"
 ],
 "AGENDA_PREFER_FOOD": [
  "TRAIT_AGENDA_PREFER_FOOD"
 ],
 "AGENDA_PREFER_LANDPOWER": [
  "TRAIT_AGENDA_PREFER_LANDPOWER"
 ],
 "AGENDA_PRESERVER_OF_THE_UNION": [
  "TRAIT_AGENDA_LINCOLN"
 ],
 "AGENDA_QUEEN_OF_NILE": [
  "TRAIT_AGENDA_QUEEN_OF_NILE"
 ],
 "AGENDA_RAVEN_BANNER": [
  "TRAIT_AGENDA_RAVEN_BANNER"
 ],
 "AGENDA_SAGA": [
  "TRAIT_AGENDA_SAGA"
 ],
 "AGENDA_SAINT": [
  "TRAIT_AGENDA_SAINT"
 ],
 "AGENDA_SAKOKU": [
  "TRAIT_AGENDA_SAKOKU"
 ],
 "AGENDA_SAPA_INCA": [
  "TRAIT_AGENDA_SAPA_INCA"
 ],
 "AGENDA_SEJONG": [
  "TRAIT_AGENDA_SEJONG"
 ],
 "AGENDA_SHORT_LIFE_GLORY": [
  "TRAIT_AGENDA_SHORT_LIFE_GLORY",
  "TRAIT_AGENDA_IGNORE_WARMONGERING"
 ],
 "AGENDA_SICILIAN_WARS": [
  "TRAIT_AGENDA_SICILIAN_WARS"
 ],
 "AGENDA_SIHAI": [
  "TRAIT_AGENDA_SIHAI"
 ],
 "AGENDA_SIMON_BOLIVAR": [
  "TRAIT_AGENDA_SIMON_BOLIVAR"
 ],
 "AGENDA_SPIRIT_OF_TUCAPEL": [
  "TRAIT_AGENDA_SPIRIT_OF_TUCAPEL"
 ],
 "AGENDA_STANDING_ARMY": [
  "TRAIT_AGENDA_PREFER_STANDING_ARMY"
 ],
 "AGENDA_SULTAN": [
  "TRAIT_AGENDA_SULTAN"
 ],
 "AGENDA_SUN_NEVER_SETS": [
  "TRAIT_AGENDA_SUN_NEVER_SETS"
 ],
 "AGENDA_SYCOPHANT": [
  "TRAIT_AGENDA_SYCOPHANT"
 ],
 "AGENDA_SYMPATHIZER": [
  "TRAIT_AGENDA_SYMPATHIZER"
 ],
 "AGENDA_TECHNOPHILE": [
  "TRAIT_AGENDA_PREFER_SCIENCE"
 ],
 "AGENDA_TLATOANI": [
  "TRAIT_AGENDA_TLATOANI"
 ],
 "AGENDA_TRADE_AGREEMENT": [
  "TRAIT_AGENDA_TRADE_AGREEMENT"
 ],
 "AGENDA_TRIEU_DEFENDER": [
  "TRAIT_AGENDA_TRIEU_DEFENDER"
 ],
 "AGENDA_TURTLER": [
  "TRAIT_AGENDA_TURTLER"
 ],
 "AGENDA_WESTERNIZER": [
  "TRAIT_AGENDA_WESTERNIZER"
 ],
 "AGENDA_WITH_YOUR_SHIELD_OR_ON_IT": [
  "TRAIT_AGENDA_WITH_SHIELD",
  "TRAIT_AGENDA_IGNORE_WARMONGERING"
 ],
 "AGENDA_WONDER_ADVOCATE": [
  "TRAIT_AGENDA_WONDER_ADVOCATE"
 ],
 "AGENDA_WONDER_OBSESSED": [
  "TRAIT_AGENDA_WONDER_OBSESSED"
 ],
 "AGENDA_YINDING": [
  "TRAIT_AGENDA_YINDING"
 ],
 "AGENDA_ZEALOT": [
  "TRAIT_AGENDA_ZEALOT"
 ]
};
export const AI_STRATEGY_LISTS: Readonly<Record<string, readonly AiListRef[]>> = {
 "STRATEGY_ANCIENT_CHANGES": [
  {
   "list": "AncientPseudoYields",
   "system": "PseudoYields"
  }
 ],
 "STRATEGY_CLASSICAL_CHANGES": [
  {
   "list": "ClassicalPseudoYields",
   "system": "PseudoYields"
  },
  {
   "list": "ClassicalYields",
   "system": "Yields"
  },
  {
   "list": "ClassicalSensitivity",
   "system": "YieldSensitivities"
  }
 ],
 "STRATEGY_DARKAGE": [
  {
   "list": "AvoidDarkAges",
   "system": "PseudoYields"
  }
 ],
 "STRATEGY_INDUSTRIAL_CHANGES": [
  {
   "list": "IndustrialYields",
   "system": "Yields"
  },
  {
   "list": "IndustrialPseudoYields",
   "system": "PseudoYields"
  }
 ],
 "STRATEGY_MEDIEVAL_CHANGES": [
  {
   "list": "MedievalYields",
   "system": "Yields"
  },
  {
   "list": "MedievalPseudoYields",
   "system": "PseudoYields"
  },
  {
   "list": "MedievalSensitivity",
   "system": "YieldSensitivities"
  }
 ],
 "STRATEGY_MODERN_CHANGES": [
  {
   "list": "ModernYields",
   "system": "Yields"
  },
  {
   "list": "ModernPseudoYields",
   "system": "PseudoYields"
  },
  {
   "list": "ModernSensitivity",
   "system": "YieldSensitivities"
  }
 ],
 "STRATEGY_NAVAL": [
  {
   "list": "NavalUnitPreferences",
   "system": "PseudoYields"
  }
 ],
 "STRATEGY_RAPID_EXPANSION": [
  {
   "list": "ExpansionUnitPreferences",
   "system": "PseudoYields"
  }
 ],
 "STRATEGY_RENAISSANCE_CHANGES": [
  {
   "list": "RenaissanceYields",
   "system": "Yields"
  },
  {
   "list": "RenaissancePseudoYields",
   "system": "PseudoYields"
  }
 ],
 "STRATEGY_WONDER_OBSESSED": [
  {
   "list": "WonderObsessedIndustrialBonus",
   "system": "PseudoYields"
  }
 ],
 "VICTORY_STRATEGY_CULTURAL_VICTORY": [
  {
   "list": "CultureVictoryPseudoYields",
   "system": "PseudoYields"
  },
  {
   "list": "CultureVictoryYields",
   "system": "Yields"
  },
  {
   "list": "CultureSensitivity",
   "system": "YieldSensitivities"
  }
 ],
 "VICTORY_STRATEGY_DIPLOMATIC_VICTORY": [
  {
   "list": "DiplomaticPseudoYieldPreferences",
   "system": "PseudoYields"
  }
 ],
 "VICTORY_STRATEGY_MILITARY_VICTORY": [
  {
   "list": "MilitaryVictoryPseudoYields",
   "system": "PseudoYields"
  },
  {
   "list": "MilitaryVictoryYields",
   "system": "Yields"
  }
 ],
 "VICTORY_STRATEGY_RELIGIOUS_VICTORY": [
  {
   "list": "ReligiousVictoryPseudoYields",
   "system": "PseudoYields"
  },
  {
   "list": "ReligiousVictoryYields",
   "system": "Yields"
  }
 ],
 "VICTORY_STRATEGY_SCIENCE_VICTORY": [
  {
   "list": "ScienceVictoryPseudoYields",
   "system": "PseudoYields"
  },
  {
   "list": "ScienceVictoryYields",
   "system": "Yields"
  },
  {
   "list": "ScienceSensitivity",
   "system": "YieldSensitivities"
  }
 ]
};
export const AI_STRATEGY_YIELD_PRIORITIES: readonly { strategy: string; yield: string; pct: number }[] = [];
export const AI_DIFFICULTIES: readonly string[] = [
 "DIFFICULTY_SETTLER",
 "DIFFICULTY_CHIEFTAIN",
 "DIFFICULTY_WARLORD",
 "DIFFICULTY_PRINCE",
 "DIFFICULTY_KING",
 "DIFFICULTY_EMPEROR",
 "DIFFICULTY_IMMORTAL",
 "DIFFICULTY_DEITY"
];
export const AI_MINOR_INFLUENCE_MODIFIERS: Readonly<Record<string, readonly AiModifier[]>> = {
 "CIVILIZATION_AKKAD": [
  {
   "id": "MINOR_CIV_AKKAD_UNIQUE_INFLUENCE_BONUS_ANTI_CAVALRY",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_AKKAD_ENABLE_WALL_ATTACK_WHOLE_GAME_ANTI_CAVALRY"
   },
   "attach": {
    "id": "MINOR_CIV_AKKAD_ENABLE_WALL_ATTACK_WHOLE_GAME_ANTI_CAVALRY",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_ADJUST_UNIT_ENABLE_WALL_ATTACK_WHOLE_GAME_PROMOTION_CLASS",
    "args": {
     "PromotionClass": "PROMOTION_CLASS_ANTI_CAVALRY"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_AKKAD_UNIQUE_INFLUENCE_BONUS_MELEE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_AKKAD_ENABLE_WALL_ATTACK_WHOLE_GAME_MELEE"
   },
   "attach": {
    "id": "MINOR_CIV_AKKAD_ENABLE_WALL_ATTACK_WHOLE_GAME_MELEE",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_ADJUST_UNIT_ENABLE_WALL_ATTACK_WHOLE_GAME_PROMOTION_CLASS",
    "args": {
     "PromotionClass": "PROMOTION_CLASS_MELEE"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_LARGE_INFLUENCE_MILITARY_ACADEMY",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_MILITARY_ACADEMY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_MILITARY_ACADEMY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_MEDIUM_INFLUENCE_ARMORY",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_ARMORY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_ARMORY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
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
        "BuildingType": "BUILDING_ARMORY"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
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
        "BuildingType": "BUILDING_CONSULATE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
    "args": {
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_BARRACKS_STABLE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_BARRACKS_STABLE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
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
        "BuildingType": "BUILDING_BARRACKS"
       }
      },
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_STABLE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_ANTANANARIVO": [
  {
   "id": "MINOR_CIV_ANTANANARIVO_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_ANTANANARIVO_CULTURE_FROM_EARNED_GREAT_PEOPLE_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_ANTANANARIVO_CULTURE_FROM_EARNED_GREAT_PEOPLE_BONUS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_YIELD_MODIFIER_PER_EARNED_GREAT_PERSON",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "Amount": "2"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_LARGE_INFLUENCE_BROADCAST_CENTER",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_BROADCAST_CENTER"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_BROADCAST_CENTER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_BROADCAST_CENTER",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_MEDIUM_INFLUENCE_MUSEUM_ART",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ART"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ART",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_MUSEUM_ART",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_MEDIUM_INFLUENCE_MUSEUM_ARTIFACT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ARTIFACT"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ARTIFACT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_MUSEUM_ARTIFACT",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_AMPHITHEATER_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_AMPHITHEATER_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_AMPHITHEATER",
     "Amount": "1",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_ANTIOCH": [
  {
   "id": "MINOR_CIV_ANTIOCH_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_ANTIOCH_LUXURY_TRADE_ROUTE_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_ANTIOCH_LUXURY_TRADE_ROUTE_BONUS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_TRADE_ROUTE_YIELD_PER_DESTINATION_LUXURY_RESOURCE_FOR_INTERNATIONAL",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "6",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_LARGE_INFLUENCE_SEAPORT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_SEAPORT"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_SEAPORT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_SEAPORT",
     "Amount": "6",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_LARGE_INFLUENCE_STOCK_EXCHANGE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_STOCK_EXCHANGE"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_STOCK_EXCHANGE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_STOCK_EXCHANGE",
     "Amount": "6",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_MEDIUM_INFLUENCE_BANK",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_BANK_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_BANK_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_BANK",
     "Amount": "4",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "4",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_MEDIUM_INFLUENCE_SHIPYARD",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_SHIPYARD_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_SHIPYARD_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_SHIPYARD",
     "Amount": "4",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "2"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_MARKET_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_MARKET_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_MARKET",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_SMALL_INFLUENCE_LIGHTHOUSE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_LIGHTHOUSE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_LIGHTHOUSE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_LIGHTHOUSE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_ARMAGH": [
  {
   "id": "MINOR_CIV_ARMAGH_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_ARMAGH_UNLOCK_MONASTERY_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_ARMAGH_UNLOCK_MONASTERY_BONUS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_VALID_IMPROVEMENT",
    "args": {
     "ImprovementType": "IMPROVEMENT_MONASTERY"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_CATHEDRAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CATHEDRAL"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CATHEDRAL",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_CATHEDRAL",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_DAR_E_MEHR",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_DAR_E_MEHR"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_DAR_E_MEHR",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_DAR_E_MEHR",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_GURDWARA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_GURDWARA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_GURDWARA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_GURDWARA",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_MEETING_HOUSE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MEETING_HOUSE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MEETING_HOUSE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_MEETING_HOUSE",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_MOSQUE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MOSQUE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MOSQUE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_MOSQUE",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_PAGODA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_PAGODA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_PAGODA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_PAGODA",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_STUPA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_STUPA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_STUPA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_STUPA",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_SYNAGOGUE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SYNAGOGUE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SYNAGOGUE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_SYNAGOGUE",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_WAT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_WAT"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_WAT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_WAT",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "2"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_MEDIUM_INFLUENCE_TEMPLE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_TEMPLE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_TEMPLE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_TEMPLE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SHRINE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SHRINE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_SHRINE",
     "Amount": "1",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_AUCKLAND": [
  {
   "id": "MINOR_CIV_AUCKLAND_UNIQUE_INFLUENCE_BONUS_BASE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_AUCKLAND_SHALLOW_WATER_PRODUCTION_BONUS_BASE"
   },
   "attach": {
    "id": "MINOR_CIV_AUCKLAND_SHALLOW_WATER_PRODUCTION_BONUS_BASE",
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
       "type": "REQUIREMENT_PLOT_TERRAIN_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "TerrainType": "TERRAIN_COAST"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_AUCKLAND_UNIQUE_INFLUENCE_BONUS_INDUSTRIAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_AUCKLAND_SHALLOW_WATER_PRODUCTION_BONUS_INDUSTRIAL"
   },
   "attach": {
    "id": "MINOR_CIV_AUCKLAND_SHALLOW_WATER_PRODUCTION_BONUS_INDUSTRIAL",
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
       "type": "REQUIREMENT_PLOT_TERRAIN_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "TerrainType": "TERRAIN_COAST"
       }
      },
      {
       "type": "REQUIREMENT_PLAYER_ERA_AT_LEAST",
       "inverse": false,
       "args": {
        "EraType": "ERA_INDUSTRIAL"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_BONUS_PAPAL_PRIMACY_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_INDUSTRIAL_ZONE_PAPAL_PRIMACY"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_INDUSTRIAL_ZONE_PAPAL_PRIMACY",
    "collection": "COLLECTION_PLAYER_DISTRICTS",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "DistrictType": "DISTRICT_INDUSTRIAL_ZONE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_FOUNDED_OUR_RELIGION",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_FOUNDED_RELIGION_WITH_BELIEF",
      "inverse": false,
      "args": {
       "BeliefType": "BELIEF_PAPAL_PRIMACY"
      }
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_ETHIOPIA_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_ETHIOPIA_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_POWER_PLANT_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
    "args": {
     "Amount": "3"
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
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_POWER_PLANT_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
    "args": {
     "Amount": "3"
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
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_ETHIOPIA_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
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
        "BuildingType": "BUILDING_CONSULATE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_ETHIOPIA_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "BuildingType": "BUILDING_CONSULATE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_FACTORY_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_FACTORY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_FACTORY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
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
        "BuildingType": "BUILDING_FACTORY"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_FACTORY_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_FACTORY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_FACTORY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "BuildingType": "BUILDING_FACTORY"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_BONUS_BUILDING_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
    "args": {
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_BONUS_DISTRICT_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
    "args": {
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_ETHIOPIA_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_WORKSHOP_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_WORKSHOP_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
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
        "BuildingType": "BUILDING_WORKSHOP"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_ETHIOPIA_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_WORKSHOP_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_WORKSHOP_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "BuildingType": "BUILDING_WORKSHOP"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_AYUTTHAYA": [
  {
   "id": "MINOR_CIV_AYUTTHAYA_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_AYUTTHAYA_CULTURE_COMPLETE_BUILDING"
   },
   "attach": {
    "id": "MINOR_CIV_AYUTTHAYA_CULTURE_COMPLETE_BUILDING",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_GRANT_CITY_YIELD_PERCENT_BUILDING_CREATED_COST",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingProductionPercent": "10",
     "IncludeWonder": "false"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_LARGE_INFLUENCE_BROADCAST_CENTER",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_BROADCAST_CENTER"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_BROADCAST_CENTER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_BROADCAST_CENTER",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_MEDIUM_INFLUENCE_MUSEUM_ART",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ART"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ART",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_MUSEUM_ART",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_MEDIUM_INFLUENCE_MUSEUM_ARTIFACT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ARTIFACT"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ARTIFACT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_MUSEUM_ARTIFACT",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_AMPHITHEATER_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_AMPHITHEATER_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_AMPHITHEATER",
     "Amount": "1",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_BABYLON": [
  {
   "id": "MINOR_CIV_BABYLON_ARTIFACT_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_BABYLON_GREAT_WORK_ARTIFACT_SCIENCE"
   },
   "attach": {
    "id": "MINOR_CIV_BABYLON_GREAT_WORK_ARTIFACT_SCIENCE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_GREATWORK_YIELD",
    "args": {
     "GreatWorkObjectType": "GREATWORKOBJECT_ARTIFACT",
     "YieldType": "YIELD_SCIENCE",
     "YieldChange": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_BABYLON_RELIC_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_BABYLON_GREAT_WORK_RELIC_SCIENCE"
   },
   "attach": {
    "id": "MINOR_CIV_BABYLON_GREAT_WORK_RELIC_SCIENCE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_GREATWORK_YIELD",
    "args": {
     "GreatWorkObjectType": "GREATWORKOBJECT_RELIC",
     "YieldType": "YIELD_SCIENCE",
     "YieldChange": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_BABYLON_WRITING_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_BABYLON_GREAT_WORK_WRITING_SCIENCE"
   },
   "attach": {
    "id": "MINOR_CIV_BABYLON_GREAT_WORK_WRITING_SCIENCE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_GREATWORK_YIELD",
    "args": {
     "GreatWorkObjectType": "GREATWORKOBJECT_WRITING",
     "YieldType": "YIELD_SCIENCE",
     "YieldChange": "2"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_LARGE_INFLUENCE_RESEARCH_LAB",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_RESEARCH_LAB"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_RESEARCH_LAB",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_RESEARCH_LAB",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_MEDIUM_INFLUENCE_UNIVERSITY",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_UNIVERSITY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_UNIVERSITY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_UNIVERSITY",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_LIBRARY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_LIBRARY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_LIBRARY",
     "Amount": "1",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_BOLOGNA": [
  {
   "id": "MINOR_CIV_BOLOGNA_UNIQUE_INFLUENCE_GREAT_ADMIRAL_POINTS_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_BOLOGNA_GREAT_ADMIRAL_POINTS_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_BOLOGNA_GREAT_ADMIRAL_POINTS_BONUS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_ADMIRAL",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_LIGHTHOUSE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_BOLOGNA_UNIQUE_INFLUENCE_GREAT_ARTIST_POINTS_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_BOLOGNA_GREAT_ARTIST_POINTS_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_BOLOGNA_GREAT_ARTIST_POINTS_BONUS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_ARTIST",
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
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_BOLOGNA_UNIQUE_INFLUENCE_GREAT_ENGINEER_POINTS_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_BOLOGNA_GREAT_ENGINEER_POINTS_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_BOLOGNA_GREAT_ENGINEER_POINTS_BONUS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_ENGINEER",
     "Amount": "1"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_BOLOGNA_UNIQUE_INFLUENCE_GREAT_GENERAL_POINTS_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_BOLOGNA_GREAT_GENERAL_POINTS_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_BOLOGNA_GREAT_GENERAL_POINTS_BONUS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_GENERAL",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_BARRACKS"
       }
      },
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_STABLE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_BOLOGNA_UNIQUE_INFLUENCE_GREAT_MERCHANT_POINTS_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_BOLOGNA_GREAT_MERCHANT_POINTS_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_BOLOGNA_GREAT_MERCHANT_POINTS_BONUS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_MERCHANT",
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_MARKET"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_BOLOGNA_UNIQUE_INFLUENCE_GREAT_MUSICIAN_POINTS_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_BOLOGNA_GREAT_MUSICIAN_POINTS_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_BOLOGNA_GREAT_MUSICIAN_POINTS_BONUS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_MUSICIAN",
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
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_BOLOGNA_UNIQUE_INFLUENCE_GREAT_PROPHET_POINTS_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_BOLOGNA_GREAT_PROPHET_POINTS_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_BOLOGNA_GREAT_PROPHET_POINTS_BONUS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_GREAT_PERSON_POINTS",
    "args": {
     "GreatPersonClassType": "GREAT_PERSON_CLASS_PROPHET",
     "Amount": "1"
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
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_BOLOGNA_UNIQUE_INFLUENCE_GREAT_SCIENTIST_POINTS_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_BOLOGNA_GREAT_SCIENTIST_POINTS_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_BOLOGNA_GREAT_SCIENTIST_POINTS_BONUS",
    "collection": "COLLECTION_PLAYER_CITIES",
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
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_BOLOGNA_UNIQUE_INFLUENCE_GREAT_WRITER_POINTS_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_BOLOGNA_GREAT_WRITER_POINTS_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_BOLOGNA_GREAT_WRITER_POINTS_BONUS",
    "collection": "COLLECTION_PLAYER_CITIES",
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
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_LARGE_INFLUENCE_RESEARCH_LAB",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_RESEARCH_LAB"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_RESEARCH_LAB",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_RESEARCH_LAB",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_MEDIUM_INFLUENCE_UNIVERSITY",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_UNIVERSITY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_UNIVERSITY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_UNIVERSITY",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_LIBRARY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_LIBRARY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_LIBRARY",
     "Amount": "1",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_BRUSSELS": [
  {
   "id": "MINOR_CIV_BRUSSELS_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_BRUSSELS_WONDER_PRODUCTION_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_BRUSSELS_WONDER_PRODUCTION_BONUS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_WONDER_PRODUCTION",
    "args": {
     "Amount": "15"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_BONUS_PAPAL_PRIMACY_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_INDUSTRIAL_ZONE_PAPAL_PRIMACY"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_INDUSTRIAL_ZONE_PAPAL_PRIMACY",
    "collection": "COLLECTION_PLAYER_DISTRICTS",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "DistrictType": "DISTRICT_INDUSTRIAL_ZONE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_FOUNDED_OUR_RELIGION",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_FOUNDED_RELIGION_WITH_BELIEF",
      "inverse": false,
      "args": {
       "BeliefType": "BELIEF_PAPAL_PRIMACY"
      }
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_ETHIOPIA_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_ETHIOPIA_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_POWER_PLANT_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
    "args": {
     "Amount": "3"
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
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_POWER_PLANT_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
    "args": {
     "Amount": "3"
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
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_ETHIOPIA_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
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
        "BuildingType": "BUILDING_CONSULATE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_ETHIOPIA_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "BuildingType": "BUILDING_CONSULATE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_FACTORY_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_FACTORY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_FACTORY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
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
        "BuildingType": "BUILDING_FACTORY"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_FACTORY_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_FACTORY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_FACTORY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "BuildingType": "BUILDING_FACTORY"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_BONUS_BUILDING_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
    "args": {
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_BONUS_DISTRICT_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
    "args": {
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_ETHIOPIA_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_WORKSHOP_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_WORKSHOP_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
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
        "BuildingType": "BUILDING_WORKSHOP"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_ETHIOPIA_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_WORKSHOP_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_WORKSHOP_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "BuildingType": "BUILDING_WORKSHOP"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_BUENOS_AIRES": [
  {
   "id": "MINOR_CIV_BUENOS_AIRES_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_BUENOS_AIRES_BONUS_RESOURCE_AMENITY_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_BUENOS_AIRES_BONUS_RESOURCE_AMENITY_BONUS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_OWNED_BONUS_RESOURCE_EXTRA_AMENITIES",
    "args": {
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_BONUS_PAPAL_PRIMACY_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_INDUSTRIAL_ZONE_PAPAL_PRIMACY"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_INDUSTRIAL_ZONE_PAPAL_PRIMACY",
    "collection": "COLLECTION_PLAYER_DISTRICTS",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "DistrictType": "DISTRICT_INDUSTRIAL_ZONE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_FOUNDED_OUR_RELIGION",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_FOUNDED_RELIGION_WITH_BELIEF",
      "inverse": false,
      "args": {
       "BeliefType": "BELIEF_PAPAL_PRIMACY"
      }
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_ETHIOPIA_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_ETHIOPIA_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_POWER_PLANT_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
    "args": {
     "Amount": "3"
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
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_POWER_PLANT_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
    "args": {
     "Amount": "3"
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
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_ETHIOPIA_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
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
        "BuildingType": "BUILDING_CONSULATE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_ETHIOPIA_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "BuildingType": "BUILDING_CONSULATE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_FACTORY_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_FACTORY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_FACTORY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
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
        "BuildingType": "BUILDING_FACTORY"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_FACTORY_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_FACTORY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_FACTORY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "BuildingType": "BUILDING_FACTORY"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_BONUS_BUILDING_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
    "args": {
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_BONUS_DISTRICT_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
    "args": {
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_ETHIOPIA_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_WORKSHOP_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_WORKSHOP_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
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
        "BuildingType": "BUILDING_WORKSHOP"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_ETHIOPIA_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_WORKSHOP_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_WORKSHOP_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "BuildingType": "BUILDING_WORKSHOP"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_CAGUANA": [
  {
   "id": "MINOR_CIV_CAGUANA_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CAGUANA_CAN_BATEY"
   },
   "attach": {
    "id": "MINOR_CIV_CAGUANA_CAN_BATEY",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_VALID_IMPROVEMENT",
    "args": {
     "ImprovementType": "IMPROVEMENT_BATEY"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_LARGE_INFLUENCE_BROADCAST_CENTER",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_BROADCAST_CENTER"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_BROADCAST_CENTER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_BROADCAST_CENTER",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_MEDIUM_INFLUENCE_MUSEUM_ART",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ART"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ART",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_MUSEUM_ART",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_MEDIUM_INFLUENCE_MUSEUM_ARTIFACT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ARTIFACT"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ARTIFACT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_MUSEUM_ARTIFACT",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_AMPHITHEATER_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_AMPHITHEATER_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_AMPHITHEATER",
     "Amount": "1",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_CAHOKIA": [
  {
   "id": "MINOR_CIV_CAHOKIA_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CAHOKIA_CAN_MOUND"
   },
   "attach": {
    "id": "MINOR_CIV_CAHOKIA_CAN_MOUND",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_VALID_IMPROVEMENT",
    "args": {
     "ImprovementType": "IMPROVEMENT_MOUND"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "6",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_LARGE_INFLUENCE_SEAPORT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_SEAPORT"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_SEAPORT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_SEAPORT",
     "Amount": "6",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_LARGE_INFLUENCE_STOCK_EXCHANGE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_STOCK_EXCHANGE"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_STOCK_EXCHANGE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_STOCK_EXCHANGE",
     "Amount": "6",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_MEDIUM_INFLUENCE_BANK",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_BANK_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_BANK_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_BANK",
     "Amount": "4",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "4",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_MEDIUM_INFLUENCE_SHIPYARD",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_SHIPYARD_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_SHIPYARD_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_SHIPYARD",
     "Amount": "4",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "2"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_MARKET_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_MARKET_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_MARKET",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_SMALL_INFLUENCE_LIGHTHOUSE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_LIGHTHOUSE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_LIGHTHOUSE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_LIGHTHOUSE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_CARDIFF": [
  {
   "id": "MINOR_CIV_CARDIFF_UNIQUE_INFLUENCE_POWER_LIGHTHOUSE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CARDIFF_POWER_LIGHTHOUSE"
   },
   "attach": {
    "id": "MINOR_CIV_CARDIFF_POWER_LIGHTHOUSE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_FREE_POWER",
    "args": {
     "Amount": "2",
     "SourceType": "FREE_POWER_SOURCE_MISC"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_LIGHTHOUSE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CARDIFF_UNIQUE_INFLUENCE_POWER_SEAPORT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CARDIFF_POWER_SEAPORT"
   },
   "attach": {
    "id": "MINOR_CIV_CARDIFF_POWER_SEAPORT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_FREE_POWER",
    "args": {
     "Amount": "2",
     "SourceType": "FREE_POWER_SOURCE_MISC"
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
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CARDIFF_UNIQUE_INFLUENCE_POWER_SHIPYARD",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CARDIFF_POWER_SHIPYARD"
   },
   "attach": {
    "id": "MINOR_CIV_CARDIFF_POWER_SHIPYARD",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_FREE_POWER",
    "args": {
     "Amount": "2",
     "SourceType": "FREE_POWER_SOURCE_MISC"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_BONUS_PAPAL_PRIMACY_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_INDUSTRIAL_ZONE_PAPAL_PRIMACY"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_INDUSTRIAL_ZONE_PAPAL_PRIMACY",
    "collection": "COLLECTION_PLAYER_DISTRICTS",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "DistrictType": "DISTRICT_INDUSTRIAL_ZONE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_FOUNDED_OUR_RELIGION",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_FOUNDED_RELIGION_WITH_BELIEF",
      "inverse": false,
      "args": {
       "BeliefType": "BELIEF_PAPAL_PRIMACY"
      }
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_ETHIOPIA_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_ETHIOPIA_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_POWER_PLANT_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
    "args": {
     "Amount": "3"
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
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_POWER_PLANT_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
    "args": {
     "Amount": "3"
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
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_ETHIOPIA_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
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
        "BuildingType": "BUILDING_CONSULATE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_ETHIOPIA_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "BuildingType": "BUILDING_CONSULATE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_FACTORY_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_FACTORY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_FACTORY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
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
        "BuildingType": "BUILDING_FACTORY"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_FACTORY_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_FACTORY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_FACTORY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "BuildingType": "BUILDING_FACTORY"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_BONUS_BUILDING_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
    "args": {
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_BONUS_DISTRICT_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
    "args": {
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_ETHIOPIA_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_WORKSHOP_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_WORKSHOP_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
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
        "BuildingType": "BUILDING_WORKSHOP"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_ETHIOPIA_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_WORKSHOP_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_WORKSHOP_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "BuildingType": "BUILDING_WORKSHOP"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_CHINGUETTI": [
  {
   "id": "MINOR_CIV_CHINGUETTI_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CHINGUETTI_FAITH_FOLLOWERS"
   },
   "attach": {
    "id": "MINOR_CIV_CHINGUETTI_FAITH_FOLLOWERS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_YIELD_PER_FOLLOWER",
    "args": {
     "YieldType": "YIELD_FAITH",
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_CATHEDRAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CATHEDRAL"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CATHEDRAL",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_CATHEDRAL",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_DAR_E_MEHR",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_DAR_E_MEHR"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_DAR_E_MEHR",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_DAR_E_MEHR",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_GURDWARA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_GURDWARA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_GURDWARA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_GURDWARA",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_MEETING_HOUSE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MEETING_HOUSE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MEETING_HOUSE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_MEETING_HOUSE",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_MOSQUE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MOSQUE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MOSQUE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_MOSQUE",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_PAGODA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_PAGODA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_PAGODA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_PAGODA",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_STUPA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_STUPA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_STUPA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_STUPA",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_SYNAGOGUE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SYNAGOGUE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SYNAGOGUE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_SYNAGOGUE",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_WAT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_WAT"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_WAT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_WAT",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "2"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_MEDIUM_INFLUENCE_TEMPLE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_TEMPLE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_TEMPLE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_TEMPLE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SHRINE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SHRINE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_SHRINE",
     "Amount": "1",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_FEZ": [
  {
   "id": "MINOR_CIV_FEZ_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_FEZ_INITIATION_SCIENCE_POPULATION"
   },
   "attach": {
    "id": "MINOR_CIV_FEZ_INITIATION_SCIENCE_POPULATION",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_ADJUST_UNIT_INITIATION_YIELD_POPULATION",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "20"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_LARGE_INFLUENCE_RESEARCH_LAB",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_RESEARCH_LAB"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_RESEARCH_LAB",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_RESEARCH_LAB",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_MEDIUM_INFLUENCE_UNIVERSITY",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_UNIVERSITY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_UNIVERSITY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_UNIVERSITY",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_LIBRARY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_LIBRARY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_LIBRARY",
     "Amount": "1",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_GENEVA": [
  {
   "id": "MINOR_CIV_GENEVA_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_GENEVA_SCIENCE_AT_PEACE_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_GENEVA_SCIENCE_AT_PEACE_BONUS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "15"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_IS_AT_PEACE_WITH_ALL_MAJORS",
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
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_LARGE_INFLUENCE_RESEARCH_LAB",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_RESEARCH_LAB"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_RESEARCH_LAB",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_RESEARCH_LAB",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_MEDIUM_INFLUENCE_UNIVERSITY",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_UNIVERSITY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_UNIVERSITY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_UNIVERSITY",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_LIBRARY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_LIBRARY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_LIBRARY",
     "Amount": "1",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_GRANADA": [
  {
   "id": "MINOR_CIV_GRANADA_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_GRANADA_UNLOCK_ALCAZAR_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_GRANADA_UNLOCK_ALCAZAR_BONUS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_VALID_IMPROVEMENT",
    "args": {
     "ImprovementType": "IMPROVEMENT_ALCAZAR"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_LARGE_INFLUENCE_MILITARY_ACADEMY",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_MILITARY_ACADEMY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_MILITARY_ACADEMY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_MEDIUM_INFLUENCE_ARMORY",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_ARMORY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_ARMORY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
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
        "BuildingType": "BUILDING_ARMORY"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
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
        "BuildingType": "BUILDING_CONSULATE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
    "args": {
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_BARRACKS_STABLE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_BARRACKS_STABLE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
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
        "BuildingType": "BUILDING_BARRACKS"
       }
      },
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_STABLE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_HATTUSA": [
  {
   "id": "MINOR_CIV_HATTUSA_UNIQUE_INFLUENCE_ALUMINUM_RESOURCE_XP2",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_HATTUSA_ALUMINUM_RESOURCE_XP2"
   },
   "attach": {
    "id": "MINOR_CIV_HATTUSA_ALUMINUM_RESOURCE_XP2",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_FREE_RESOURCE_IMPORT_EXTRACTION",
    "args": {
     "ResourceType": "RESOURCE_ALUMINUM",
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_HAS_RESOURCE_IMPROVED",
       "inverse": true,
       "args": {
        "ResourceType": "RESOURCE_ALUMINUM"
       }
      },
      {
       "type": "REQUIREMENT_PLAYER_HAS_RESOURCE_VISIBILITY",
       "inverse": false,
       "args": {
        "ResourceType": "RESOURCE_ALUMINUM"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_HATTUSA_UNIQUE_INFLUENCE_COAL_RESOURCE_XP2",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_HATTUSA_COAL_RESOURCE_XP2"
   },
   "attach": {
    "id": "MINOR_CIV_HATTUSA_COAL_RESOURCE_XP2",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_FREE_RESOURCE_IMPORT_EXTRACTION",
    "args": {
     "ResourceType": "RESOURCE_COAL",
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_HAS_RESOURCE_IMPROVED",
       "inverse": true,
       "args": {
        "ResourceType": "RESOURCE_COAL"
       }
      },
      {
       "type": "REQUIREMENT_PLAYER_HAS_RESOURCE_VISIBILITY",
       "inverse": false,
       "args": {
        "ResourceType": "RESOURCE_COAL"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_HATTUSA_UNIQUE_INFLUENCE_HORSES_RESOURCE_XP2",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_HATTUSA_HORSES_RESOURCE_XP2"
   },
   "attach": {
    "id": "MINOR_CIV_HATTUSA_HORSES_RESOURCE_XP2",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_FREE_RESOURCE_IMPORT_EXTRACTION",
    "args": {
     "ResourceType": "RESOURCE_HORSES",
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_HAS_RESOURCE_IMPROVED",
       "inverse": true,
       "args": {
        "ResourceType": "RESOURCE_HORSES"
       }
      },
      {
       "type": "REQUIREMENT_PLAYER_HAS_RESOURCE_VISIBILITY",
       "inverse": false,
       "args": {
        "ResourceType": "RESOURCE_HORSES"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_HATTUSA_UNIQUE_INFLUENCE_IRON_RESOURCE_XP2",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_HATTUSA_IRON_RESOURCE_XP2"
   },
   "attach": {
    "id": "MINOR_CIV_HATTUSA_IRON_RESOURCE_XP2",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_FREE_RESOURCE_IMPORT_EXTRACTION",
    "args": {
     "ResourceType": "RESOURCE_IRON",
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_HAS_RESOURCE_IMPROVED",
       "inverse": true,
       "args": {
        "ResourceType": "RESOURCE_IRON"
       }
      },
      {
       "type": "REQUIREMENT_PLAYER_HAS_RESOURCE_VISIBILITY",
       "inverse": false,
       "args": {
        "ResourceType": "RESOURCE_IRON"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_HATTUSA_UNIQUE_INFLUENCE_NITER_RESOURCE_XP2",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_HATTUSA_NITER_RESOURCE_XP2"
   },
   "attach": {
    "id": "MINOR_CIV_HATTUSA_NITER_RESOURCE_XP2",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_FREE_RESOURCE_IMPORT_EXTRACTION",
    "args": {
     "ResourceType": "RESOURCE_NITER",
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_HAS_RESOURCE_IMPROVED",
       "inverse": true,
       "args": {
        "ResourceType": "RESOURCE_NITER"
       }
      },
      {
       "type": "REQUIREMENT_PLAYER_HAS_RESOURCE_VISIBILITY",
       "inverse": false,
       "args": {
        "ResourceType": "RESOURCE_NITER"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_HATTUSA_UNIQUE_INFLUENCE_OIL_RESOURCE_XP2",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_HATTUSA_OIL_RESOURCE_XP2"
   },
   "attach": {
    "id": "MINOR_CIV_HATTUSA_OIL_RESOURCE_XP2",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_FREE_RESOURCE_IMPORT_EXTRACTION",
    "args": {
     "ResourceType": "RESOURCE_OIL",
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_HAS_RESOURCE_IMPROVED",
       "inverse": true,
       "args": {
        "ResourceType": "RESOURCE_OIL"
       }
      },
      {
       "type": "REQUIREMENT_PLAYER_HAS_RESOURCE_VISIBILITY",
       "inverse": false,
       "args": {
        "ResourceType": "RESOURCE_OIL"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_HATTUSA_UNIQUE_INFLUENCE_URANIUM_RESOURCE_XP2",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_HATTUSA_URANIUM_RESOURCE_XP2"
   },
   "attach": {
    "id": "MINOR_CIV_HATTUSA_URANIUM_RESOURCE_XP2",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_FREE_RESOURCE_IMPORT_EXTRACTION",
    "args": {
     "ResourceType": "RESOURCE_URANIUM",
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_HAS_RESOURCE_IMPROVED",
       "inverse": true,
       "args": {
        "ResourceType": "RESOURCE_URANIUM"
       }
      },
      {
       "type": "REQUIREMENT_PLAYER_HAS_RESOURCE_VISIBILITY",
       "inverse": false,
       "args": {
        "ResourceType": "RESOURCE_URANIUM"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_LARGE_INFLUENCE_RESEARCH_LAB",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_RESEARCH_LAB"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_RESEARCH_LAB",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_RESEARCH_LAB",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_MEDIUM_INFLUENCE_UNIVERSITY",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_UNIVERSITY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_UNIVERSITY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_UNIVERSITY",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_LIBRARY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_LIBRARY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_LIBRARY",
     "Amount": "1",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_HONG_KONG": [
  {
   "id": "MINOR_CIV_HONG_KONG_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_HONG_KONG_PROJECT_PRODUCTION_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_HONG_KONG_PROJECT_PRODUCTION_BONUS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_ALL_PROJECTS_PRODUCTION",
    "args": {
     "Amount": "20"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_BONUS_PAPAL_PRIMACY_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_INDUSTRIAL_ZONE_PAPAL_PRIMACY"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_INDUSTRIAL_ZONE_PAPAL_PRIMACY",
    "collection": "COLLECTION_PLAYER_DISTRICTS",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "DistrictType": "DISTRICT_INDUSTRIAL_ZONE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_FOUNDED_OUR_RELIGION",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_FOUNDED_RELIGION_WITH_BELIEF",
      "inverse": false,
      "args": {
       "BeliefType": "BELIEF_PAPAL_PRIMACY"
      }
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_ETHIOPIA_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_ETHIOPIA_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_POWER_PLANT_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
    "args": {
     "Amount": "3"
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
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_POWER_PLANT_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
    "args": {
     "Amount": "3"
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
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_ETHIOPIA_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
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
        "BuildingType": "BUILDING_CONSULATE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_ETHIOPIA_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "BuildingType": "BUILDING_CONSULATE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_FACTORY_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_FACTORY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_FACTORY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
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
        "BuildingType": "BUILDING_FACTORY"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_FACTORY_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_FACTORY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_FACTORY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "BuildingType": "BUILDING_FACTORY"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_BONUS_BUILDING_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
    "args": {
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_BONUS_DISTRICT_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
    "args": {
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_ETHIOPIA_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_WORKSHOP_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_WORKSHOP_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
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
        "BuildingType": "BUILDING_WORKSHOP"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_ETHIOPIA_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_WORKSHOP_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_WORKSHOP_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "BuildingType": "BUILDING_WORKSHOP"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_HUNZA": [
  {
   "id": "MINOR_CIV_HUNZA_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_HUNZA_GOLD_FROM_TRADE_ROUTE_LENGTH"
   },
   "attach": {
    "id": "MINOR_CIV_HUNZA_GOLD_FROM_TRADE_ROUTE_LENGTH",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_YIELD_PER_PATH_TILE",
    "args": {
     "Amount": "0.2",
     "YieldType": "YIELD_GOLD"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "6",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_LARGE_INFLUENCE_SEAPORT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_SEAPORT"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_SEAPORT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_SEAPORT",
     "Amount": "6",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_LARGE_INFLUENCE_STOCK_EXCHANGE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_STOCK_EXCHANGE"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_STOCK_EXCHANGE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_STOCK_EXCHANGE",
     "Amount": "6",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_MEDIUM_INFLUENCE_BANK",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_BANK_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_BANK_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_BANK",
     "Amount": "4",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "4",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_MEDIUM_INFLUENCE_SHIPYARD",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_SHIPYARD_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_SHIPYARD_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_SHIPYARD",
     "Amount": "4",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "2"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_MARKET_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_MARKET_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_MARKET",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_SMALL_INFLUENCE_LIGHTHOUSE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_LIGHTHOUSE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_LIGHTHOUSE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_LIGHTHOUSE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_JAKARTA": [
  {
   "id": "MINOR_CIV_JAKARTA_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_JAKARTA_TRADING_POST_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_JAKARTA_TRADING_POST_BONUS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_TRADE_ROUTE_YIELD_PER_POST_IN_FOREIGN_CITY",
    "args": {
     "Amount": "1",
     "YieldType": "YIELD_GOLD"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "6",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_LARGE_INFLUENCE_SEAPORT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_SEAPORT"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_SEAPORT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_SEAPORT",
     "Amount": "6",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_LARGE_INFLUENCE_STOCK_EXCHANGE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_STOCK_EXCHANGE"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_STOCK_EXCHANGE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_STOCK_EXCHANGE",
     "Amount": "6",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_MEDIUM_INFLUENCE_BANK",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_BANK_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_BANK_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_BANK",
     "Amount": "4",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "4",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_MEDIUM_INFLUENCE_SHIPYARD",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_SHIPYARD_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_SHIPYARD_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_SHIPYARD",
     "Amount": "4",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "2"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_MARKET_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_MARKET_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_MARKET",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_SMALL_INFLUENCE_LIGHTHOUSE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_LIGHTHOUSE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_LIGHTHOUSE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_LIGHTHOUSE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_JERUSALEM": [
  {
   "id": "MINOR_CIV_JERUSALEM_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_JERUSALEM_HOLY_SITE_UPGRADE"
   },
   "attach": {
    "id": "MINOR_CIV_JERUSALEM_HOLY_SITE_UPGRADE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_TREAT_HOLY_SITE_AS_HOLY_CITY",
    "args": {
     "Value": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_CATHEDRAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CATHEDRAL"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CATHEDRAL",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_CATHEDRAL",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_DAR_E_MEHR",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_DAR_E_MEHR"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_DAR_E_MEHR",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_DAR_E_MEHR",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_GURDWARA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_GURDWARA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_GURDWARA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_GURDWARA",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_MEETING_HOUSE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MEETING_HOUSE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MEETING_HOUSE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_MEETING_HOUSE",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_MOSQUE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MOSQUE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MOSQUE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_MOSQUE",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_PAGODA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_PAGODA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_PAGODA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_PAGODA",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_STUPA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_STUPA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_STUPA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_STUPA",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_SYNAGOGUE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SYNAGOGUE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SYNAGOGUE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_SYNAGOGUE",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_WAT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_WAT"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_WAT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_WAT",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "2"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_MEDIUM_INFLUENCE_TEMPLE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_TEMPLE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_TEMPLE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_TEMPLE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SHRINE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SHRINE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_SHRINE",
     "Amount": "1",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_JOHANNESBURG": [
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_BONUS_PAPAL_PRIMACY_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_INDUSTRIAL_ZONE_PAPAL_PRIMACY"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_INDUSTRIAL_ZONE_PAPAL_PRIMACY",
    "collection": "COLLECTION_PLAYER_DISTRICTS",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "DistrictType": "DISTRICT_INDUSTRIAL_ZONE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_FOUNDED_OUR_RELIGION",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_FOUNDED_RELIGION_WITH_BELIEF",
      "inverse": false,
      "args": {
       "BeliefType": "BELIEF_PAPAL_PRIMACY"
      }
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_ETHIOPIA_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_ETHIOPIA_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_POWER_PLANT_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
    "args": {
     "Amount": "3"
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
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_POWER_PLANT_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
    "args": {
     "Amount": "3"
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
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_ETHIOPIA_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
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
        "BuildingType": "BUILDING_CONSULATE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_ETHIOPIA_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "BuildingType": "BUILDING_CONSULATE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_FACTORY_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_FACTORY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_FACTORY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
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
        "BuildingType": "BUILDING_FACTORY"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_FACTORY_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_FACTORY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_FACTORY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "BuildingType": "BUILDING_FACTORY"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_BONUS_BUILDING_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
    "args": {
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_BONUS_DISTRICT_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
    "args": {
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_ETHIOPIA_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_WORKSHOP_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_WORKSHOP_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
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
        "BuildingType": "BUILDING_WORKSHOP"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_ETHIOPIA_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_WORKSHOP_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_WORKSHOP_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "BuildingType": "BUILDING_WORKSHOP"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_JOHANNESBURG_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_JOHANNESBURG_PRODUCTION_RESOURCES"
   },
   "attach": {
    "id": "MINOR_CIV_JOHANNESBURG_PRODUCTION_RESOURCES",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_YIELD_BY_NUMBER_OF_RESOURCES",
    "args": {
     "YieldType": "YIELD_PRODUCTION",
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_JOHANNESBURG_UNIQUE_INFLUENCE_BONUS_LATE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_JOHANNESBURG_PRODUCTION_RESOURCES_LATE"
   },
   "attach": {
    "id": "MINOR_CIV_JOHANNESBURG_PRODUCTION_RESOURCES_LATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_YIELD_BY_NUMBER_OF_RESOURCES",
    "args": {
     "Amount": "1",
     "YieldType": "YIELD_PRODUCTION"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_HAS_TECHNOLOGY",
       "inverse": false,
       "args": {
        "TechnologyType": "TECH_INDUSTRIALIZATION"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_KABUL": [
  {
   "id": "MINOR_CIV_KABUL_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_KABUL_UNIT_EXPERIENCE_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_KABUL_UNIT_EXPERIENCE_BONUS",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_ADJUST_UNIT_ATTACK_EXPERIENCE_MODIFIER",
    "args": {
     "Amount": "100"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_LARGE_INFLUENCE_MILITARY_ACADEMY",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_MILITARY_ACADEMY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_MILITARY_ACADEMY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_MEDIUM_INFLUENCE_ARMORY",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_ARMORY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_ARMORY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
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
        "BuildingType": "BUILDING_ARMORY"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
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
        "BuildingType": "BUILDING_CONSULATE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
    "args": {
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_BARRACKS_STABLE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_BARRACKS_STABLE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
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
        "BuildingType": "BUILDING_BARRACKS"
       }
      },
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_STABLE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_KANDY": [
  {
   "id": "MINOR_CIV_KANDY_UNIQUE_INFLUENCE_BETTER_RELIC_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_KANDY_BETTER_RELIC_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_KANDY_BETTER_RELIC_BONUS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_GREATWORK_YIELD",
    "args": {
     "GreatWorkObjectType": "GREATWORKOBJECT_RELIC",
     "YieldType": "YIELD_FAITH",
     "ScalingFactor": "150"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_KANDY_UNIQUE_INFLUENCE_GRANT_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_KANDY_GRANT_RELIC_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_KANDY_GRANT_RELIC_BONUS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_NATURAL_WONDER_RELIC",
    "args": {
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_CATHEDRAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CATHEDRAL"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CATHEDRAL",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_CATHEDRAL",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_DAR_E_MEHR",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_DAR_E_MEHR"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_DAR_E_MEHR",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_DAR_E_MEHR",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_GURDWARA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_GURDWARA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_GURDWARA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_GURDWARA",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_MEETING_HOUSE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MEETING_HOUSE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MEETING_HOUSE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_MEETING_HOUSE",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_MOSQUE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MOSQUE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MOSQUE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_MOSQUE",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_PAGODA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_PAGODA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_PAGODA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_PAGODA",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_STUPA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_STUPA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_STUPA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_STUPA",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_SYNAGOGUE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SYNAGOGUE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SYNAGOGUE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_SYNAGOGUE",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_WAT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_WAT"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_WAT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_WAT",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "2"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_MEDIUM_INFLUENCE_TEMPLE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_TEMPLE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_TEMPLE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_TEMPLE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SHRINE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SHRINE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_SHRINE",
     "Amount": "1",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_KUMASI": [
  {
   "id": "MINOR_CIV_CULTURAL_LARGE_INFLUENCE_BROADCAST_CENTER",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_BROADCAST_CENTER"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_BROADCAST_CENTER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_BROADCAST_CENTER",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_MEDIUM_INFLUENCE_MUSEUM_ART",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ART"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ART",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_MUSEUM_ART",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_MEDIUM_INFLUENCE_MUSEUM_ARTIFACT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ARTIFACT"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ARTIFACT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_MUSEUM_ARTIFACT",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_AMPHITHEATER_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_AMPHITHEATER_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_AMPHITHEATER",
     "Amount": "1",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_KUMASI_UNIQUE_INFLUENCE_TRADE_CULTURE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_KUMASI_CULTURE_TRADE_ROUTE_YIELD_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_KUMASI_CULTURE_TRADE_ROUTE_YIELD_BONUS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_STATE_TRADE_ROUTE_DISTRICT_YIELD",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "Amount": "2"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_KUMASI_UNIQUE_INFLUENCE_TRADE_GOLD_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_KUMASI_GOLD_TRADE_ROUTE_YIELD_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_KUMASI_GOLD_TRADE_ROUTE_YIELD_BONUS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITY_STATE_TRADE_ROUTE_DISTRICT_YIELD",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_LAHORE": [
  {
   "id": "MINOR_CIV_LAHORE_UNIQUE_UNIT_UNLOCK",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_LAHORE_NIHANG_UNIQUE_UNIT"
   },
   "attach": {
    "id": "MINOR_CIV_LAHORE_NIHANG_UNIQUE_UNIT",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_VALID_UNIT_BUILD",
    "args": {
     "UnitType": "UNIT_LAHORE_NIHANG"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_LARGE_INFLUENCE_MILITARY_ACADEMY",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_MILITARY_ACADEMY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_MILITARY_ACADEMY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_MEDIUM_INFLUENCE_ARMORY",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_ARMORY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_ARMORY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
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
        "BuildingType": "BUILDING_ARMORY"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
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
        "BuildingType": "BUILDING_CONSULATE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
    "args": {
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_BARRACKS_STABLE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_BARRACKS_STABLE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
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
        "BuildingType": "BUILDING_BARRACKS"
       }
      },
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_STABLE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_LA_VENTA": [
  {
   "id": "MINOR_CIV_LA_VENTA_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_LA_VENTA_CAN_COLLOSSAL_HEAD"
   },
   "attach": {
    "id": "MINOR_CIV_LA_VENTA_CAN_COLLOSSAL_HEAD",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_VALID_IMPROVEMENT",
    "args": {
     "ImprovementType": "IMPROVEMENT_COLOSSAL_HEAD"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_CATHEDRAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CATHEDRAL"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CATHEDRAL",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_CATHEDRAL",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_DAR_E_MEHR",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_DAR_E_MEHR"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_DAR_E_MEHR",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_DAR_E_MEHR",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_GURDWARA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_GURDWARA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_GURDWARA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_GURDWARA",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_MEETING_HOUSE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MEETING_HOUSE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MEETING_HOUSE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_MEETING_HOUSE",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_MOSQUE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MOSQUE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MOSQUE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_MOSQUE",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_PAGODA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_PAGODA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_PAGODA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_PAGODA",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_STUPA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_STUPA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_STUPA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_STUPA",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_SYNAGOGUE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SYNAGOGUE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SYNAGOGUE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_SYNAGOGUE",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_WAT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_WAT"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_WAT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_WAT",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "2"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_MEDIUM_INFLUENCE_TEMPLE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_TEMPLE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_TEMPLE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_TEMPLE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SHRINE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SHRINE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_SHRINE",
     "Amount": "1",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_LISBON": [
  {
   "id": "MINOR_CIV_LISBON_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_LISBON_SEA_TRADE_ROUTE_PLUNDER_IMMUNITY_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_LISBON_SEA_TRADE_ROUTE_PLUNDER_IMMUNITY_BONUS",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_TRADE_ROUTE_PLUNDER_IMMUNITY_SEA"
    },
    "ability": [
     {
      "id": "TRADE_ROUTE_PLUNDER_IMMUNITY_SEA",
      "collection": "COLLECTION_OWNER",
      "effect": "EFFECT_ADJUST_UNIT_TRADE_ROUTE_PLUNDER_IMMUNITY",
      "args": {
       "DomainType": "DOMAIN_SEA"
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
        "UnitType": "UNIT_TRADER"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "6",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_LARGE_INFLUENCE_SEAPORT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_SEAPORT"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_SEAPORT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_SEAPORT",
     "Amount": "6",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_LARGE_INFLUENCE_STOCK_EXCHANGE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_STOCK_EXCHANGE"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_STOCK_EXCHANGE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_STOCK_EXCHANGE",
     "Amount": "6",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_MEDIUM_INFLUENCE_BANK",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_BANK_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_BANK_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_BANK",
     "Amount": "4",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "4",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_MEDIUM_INFLUENCE_SHIPYARD",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_SHIPYARD_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_SHIPYARD_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_SHIPYARD",
     "Amount": "4",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "2"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_MARKET_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_MARKET_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_MARKET",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_SMALL_INFLUENCE_LIGHTHOUSE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_LIGHTHOUSE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_LIGHTHOUSE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_LIGHTHOUSE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_MEXICO_CITY": [
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_BONUS_PAPAL_PRIMACY_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_INDUSTRIAL_ZONE_PAPAL_PRIMACY"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_INDUSTRIAL_ZONE_PAPAL_PRIMACY",
    "collection": "COLLECTION_PLAYER_DISTRICTS",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "DistrictType": "DISTRICT_INDUSTRIAL_ZONE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_FOUNDED_OUR_RELIGION",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_FOUNDED_RELIGION_WITH_BELIEF",
      "inverse": false,
      "args": {
       "BeliefType": "BELIEF_PAPAL_PRIMACY"
      }
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_ETHIOPIA_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_ETHIOPIA_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_POWER_PLANT_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
    "args": {
     "Amount": "3"
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
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_POWER_PLANT_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
    "args": {
     "Amount": "3"
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
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_ETHIOPIA_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
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
        "BuildingType": "BUILDING_CONSULATE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_ETHIOPIA_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "BuildingType": "BUILDING_CONSULATE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_FACTORY_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_FACTORY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_FACTORY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
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
        "BuildingType": "BUILDING_FACTORY"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_FACTORY_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_FACTORY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_FACTORY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "BuildingType": "BUILDING_FACTORY"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_BONUS_BUILDING_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
    "args": {
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_BONUS_DISTRICT_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
    "args": {
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_ETHIOPIA_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_WORKSHOP_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_WORKSHOP_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
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
        "BuildingType": "BUILDING_WORKSHOP"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_ETHIOPIA_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_WORKSHOP_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_WORKSHOP_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "BuildingType": "BUILDING_WORKSHOP"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MEXICO_CITY_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MEXICO_CITY_REGIONAL_RANGE_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_MEXICO_CITY_REGIONAL_RANGE_BONUS",
    "collection": "COLLECTION_PLAYER_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_EXTRA_REGIONAL_RANGE",
    "args": {
     "Amount": "3"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_DISTRICT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_INDUSTRIAL_ZONE"
       }
      },
      {
       "type": "REQUIREMENT_DISTRICT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_ENTERTAINMENT_COMPLEX"
       }
      },
      {
       "type": "REQUIREMENT_DISTRICT_TYPE_MATCHES",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_WATER_ENTERTAINMENT_COMPLEX"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_MOHENJO_DARO": [
  {
   "id": "MINOR_CIV_CULTURAL_LARGE_INFLUENCE_BROADCAST_CENTER",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_BROADCAST_CENTER"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_BROADCAST_CENTER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_BROADCAST_CENTER",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_MEDIUM_INFLUENCE_MUSEUM_ART",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ART"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ART",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_MUSEUM_ART",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_MEDIUM_INFLUENCE_MUSEUM_ARTIFACT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ARTIFACT"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ARTIFACT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_MUSEUM_ARTIFACT",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_AMPHITHEATER_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_AMPHITHEATER_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_AMPHITHEATER",
     "Amount": "1",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MOHENJO_DARO_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MOHENJO_DARO_CITIES_FRESHWATER_HOUSING_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_MOHENJO_DARO_CITIES_FRESHWATER_HOUSING_BONUS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_CITIES_FRESHWATER_HOUSING_BONUS",
    "args": {
     "HasBonus": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_MUSCAT": [
  {
   "id": "MINOR_CIV_MUSCAT_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MUSCAT_COMMERCIAL_HUB_AMENITY_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_MUSCAT_COMMERCIAL_HUB_AMENITY_BONUS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_AMENITIES_FROM_CITY_STATES",
    "args": {
     "Amount": "1"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "6",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_LARGE_INFLUENCE_SEAPORT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_SEAPORT"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_SEAPORT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_SEAPORT",
     "Amount": "6",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_LARGE_INFLUENCE_STOCK_EXCHANGE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_STOCK_EXCHANGE"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_STOCK_EXCHANGE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_STOCK_EXCHANGE",
     "Amount": "6",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_MEDIUM_INFLUENCE_BANK",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_BANK_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_BANK_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_BANK",
     "Amount": "4",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "4",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_MEDIUM_INFLUENCE_SHIPYARD",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_SHIPYARD_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_SHIPYARD_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_SHIPYARD",
     "Amount": "4",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "2"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_MARKET_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_MARKET_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_MARKET",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_SMALL_INFLUENCE_LIGHTHOUSE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_LIGHTHOUSE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_LIGHTHOUSE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_LIGHTHOUSE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_NALANDA": [
  {
   "id": "MINOR_CIV_NALANDA_FREE_TECHNOLOGY",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_NALANDA_FREE_TECHNOLOGY_MODIFIER"
   },
   "attach": {
    "id": "MINOR_CIV_NALANDA_FREE_TECHNOLOGY_MODIFIER",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GRANT_PLAYER_RANDOM_TECHNOLOGY",
    "args": {
     "Amount": "1"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_PLAYER_HAS_IMPROVEMENT",
       "inverse": false,
       "args": {
        "ImprovementType": "IMPROVEMENT_MAHAVIHARA"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_NALANDA_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_NALANDA_CAN_MAHAVIHARA"
   },
   "attach": {
    "id": "MINOR_CIV_NALANDA_CAN_MAHAVIHARA",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_VALID_IMPROVEMENT",
    "args": {
     "ImprovementType": "IMPROVEMENT_MAHAVIHARA"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_LARGE_INFLUENCE_RESEARCH_LAB",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_RESEARCH_LAB"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_RESEARCH_LAB",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_RESEARCH_LAB",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_MEDIUM_INFLUENCE_UNIVERSITY",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_UNIVERSITY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_UNIVERSITY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_UNIVERSITY",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_LIBRARY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_LIBRARY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_LIBRARY",
     "Amount": "1",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_NAN_MADOL": [
  {
   "id": "MINOR_CIV_CULTURAL_LARGE_INFLUENCE_BROADCAST_CENTER",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_BROADCAST_CENTER"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_BROADCAST_CENTER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_BROADCAST_CENTER",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_MEDIUM_INFLUENCE_MUSEUM_ART",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ART"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ART",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_MUSEUM_ART",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_MEDIUM_INFLUENCE_MUSEUM_ARTIFACT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ARTIFACT"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ARTIFACT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_MUSEUM_ARTIFACT",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_AMPHITHEATER_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_AMPHITHEATER_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_AMPHITHEATER",
     "Amount": "1",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_NAN_MADOL_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_NAN_MADOL_DISTRICTS_CULTURE_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_NAN_MADOL_DISTRICTS_CULTURE_BONUS",
    "collection": "COLLECTION_PLAYER_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_YIELD_CHANGE",
    "args": {
     "Amount": "2",
     "YieldType": "YIELD_CULTURE"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_NAZCA": [
  {
   "id": "MINOR_CIV_NAZCA_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_NAZCA_CAN_NAZCA_LINE"
   },
   "attach": {
    "id": "MINOR_CIV_NAZCA_CAN_NAZCA_LINE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_VALID_IMPROVEMENT",
    "args": {
     "ImprovementType": "IMPROVEMENT_NAZCA_LINE"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_CATHEDRAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CATHEDRAL"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CATHEDRAL",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_CATHEDRAL",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_DAR_E_MEHR",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_DAR_E_MEHR"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_DAR_E_MEHR",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_DAR_E_MEHR",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_GURDWARA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_GURDWARA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_GURDWARA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_GURDWARA",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_MEETING_HOUSE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MEETING_HOUSE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MEETING_HOUSE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_MEETING_HOUSE",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_MOSQUE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MOSQUE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MOSQUE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_MOSQUE",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_PAGODA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_PAGODA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_PAGODA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_PAGODA",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_STUPA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_STUPA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_STUPA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_STUPA",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_SYNAGOGUE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SYNAGOGUE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SYNAGOGUE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_SYNAGOGUE",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_WAT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_WAT"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_WAT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_WAT",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "2"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_MEDIUM_INFLUENCE_TEMPLE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_TEMPLE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_TEMPLE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_TEMPLE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SHRINE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SHRINE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_SHRINE",
     "Amount": "1",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_NGAZARGAMU": [
  {
   "id": "MINOR_CIV_MILITARISTIC_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_LARGE_INFLUENCE_MILITARY_ACADEMY",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_MILITARY_ACADEMY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_MILITARY_ACADEMY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_MEDIUM_INFLUENCE_ARMORY",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_ARMORY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_ARMORY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
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
        "BuildingType": "BUILDING_ARMORY"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
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
        "BuildingType": "BUILDING_CONSULATE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
    "args": {
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_BARRACKS_STABLE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_BARRACKS_STABLE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
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
        "BuildingType": "BUILDING_BARRACKS"
       }
      },
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_STABLE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_NGAZARGAMU_UNIQUE_INFLUENCE_ARMORY_PURCHASE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_NGAZARGAMU_ARMORY_PURCHASE_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_NGAZARGAMU_ARMORY_PURCHASE_BONUS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_ALL_UNITS_PURCHASE_COST",
    "args": {
     "Amount": "20",
     "UnitDomain": "DOMAIN_LAND"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_NGAZARGAMU_UNIQUE_INFLUENCE_BARRACKS_STABLE_PURCHASE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_NGAZARGAMU_BARRACKS_STABLE_PURCHASE_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_NGAZARGAMU_BARRACKS_STABLE_PURCHASE_BONUS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_ALL_UNITS_PURCHASE_COST",
    "args": {
     "Amount": "20",
     "UnitDomain": "DOMAIN_LAND"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_BARRACKS"
       }
      },
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_STABLE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_NGAZARGAMU_UNIQUE_INFLUENCE_MILITARY_ACADEMY_PURCHASE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_NGAZARGAMU_MILITARY_ACADEMY_PURCHASE_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_NGAZARGAMU_MILITARY_ACADEMY_PURCHASE_BONUS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_ALL_UNITS_PURCHASE_COST",
    "args": {
     "Amount": "20",
     "UnitDomain": "DOMAIN_LAND"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_PALENQUE": [
  {
   "id": "MINOR_CIV_PALENQUE_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_PALENQUE_CAMPUS_GROWTH_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_PALENQUE_CAMPUS_GROWTH_BONUS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_GROWTH",
    "args": {
     "Amount": "15"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_DISTRICT",
       "inverse": false,
       "args": {
        "DistrictType": "DISTRICT_CAMPUS"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_LARGE_INFLUENCE_RESEARCH_LAB",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_RESEARCH_LAB"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_RESEARCH_LAB",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_RESEARCH_LAB",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_MEDIUM_INFLUENCE_UNIVERSITY",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_UNIVERSITY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_UNIVERSITY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_UNIVERSITY",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_LIBRARY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_LIBRARY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_LIBRARY",
     "Amount": "1",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_PRESLAV": [
  {
   "id": "MINOR_CIV_MILITARISTIC_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_LARGE_INFLUENCE_MILITARY_ACADEMY",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_MILITARY_ACADEMY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_MILITARY_ACADEMY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_MEDIUM_INFLUENCE_ARMORY",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_ARMORY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_ARMORY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
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
        "BuildingType": "BUILDING_ARMORY"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
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
        "BuildingType": "BUILDING_CONSULATE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
    "args": {
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_BARRACKS_STABLE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_BARRACKS_STABLE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
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
        "BuildingType": "BUILDING_BARRACKS"
       }
      },
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_STABLE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_PRESLAV_UNIQUE_INFLUENCE_ARMORY_IDENTITY_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_PRESLAV_ARMORY_IDENTITY_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_PRESLAV_ARMORY_IDENTITY_BONUS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_IDENTITY_PER_TURN",
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
        "BuildingType": "BUILDING_ARMORY"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_PRESLAV_UNIQUE_INFLUENCE_BARRACKS_STABLE_IDENTITY_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_PRESLAV_BARRACKS_STABLE_IDENTITY_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_PRESLAV_BARRACKS_STABLE_IDENTITY_BONUS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_IDENTITY_PER_TURN",
    "args": {
     "Amount": "2"
    },
    "subjectReqs": {
     "test": "ANY",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_BARRACKS"
       }
      },
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_STABLE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_PRESLAV_UNIQUE_INFLUENCE_MILITARY_ACADEMY_IDENTITY_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_PRESLAV_MILITARY_ACADEMY_IDENTITY_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_PRESLAV_MILITARY_ACADEMY_IDENTITY_BONUS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_IDENTITY_PER_TURN",
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
        "BuildingType": "BUILDING_MILITARY_ACADEMY"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_RAPA_NUI": [
  {
   "id": "MINOR_CIV_CULTURAL_LARGE_INFLUENCE_BROADCAST_CENTER",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_BROADCAST_CENTER"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_BROADCAST_CENTER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_BROADCAST_CENTER",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_MEDIUM_INFLUENCE_MUSEUM_ART",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ART"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ART",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_MUSEUM_ART",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_MEDIUM_INFLUENCE_MUSEUM_ARTIFACT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ARTIFACT"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ARTIFACT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_MUSEUM_ARTIFACT",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_AMPHITHEATER_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_AMPHITHEATER_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_AMPHITHEATER",
     "Amount": "1",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RAPA_NUI_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RAPA_NUI_CAN_MOAI"
   },
   "attach": {
    "id": "MINOR_CIV_RAPA_NUI_CAN_MOAI",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_VALID_IMPROVEMENT",
    "args": {
     "ImprovementType": "IMPROVEMENT_MOAI"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_SAMARKAND": [
  {
   "id": "MINOR_CIV_SAMARKAND_TRADE_GOLD",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SAMARKAND_TRADE_GOLD_MODIFIER"
   },
   "attach": {
    "id": "MINOR_CIV_SAMARKAND_TRADE_GOLD_MODIFIER",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_INTERNATIONAL_TRADE_ROUTE_YIELD_PER_IMPROVEMENT_IN_ORIGIN_CITY",
    "args": {
     "Amount": "1",
     "ImprovementType": "IMPROVEMENT_TRADING_DOME",
     "YieldType": "YIELD_GOLD"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SAMARKAND_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SAMARKAND_CAN_TRADING_DOME"
   },
   "attach": {
    "id": "MINOR_CIV_SAMARKAND_CAN_TRADING_DOME",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_VALID_IMPROVEMENT",
    "args": {
     "ImprovementType": "IMPROVEMENT_TRADING_DOME"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "6",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_LARGE_INFLUENCE_SEAPORT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_SEAPORT"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_SEAPORT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_SEAPORT",
     "Amount": "6",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_LARGE_INFLUENCE_STOCK_EXCHANGE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_STOCK_EXCHANGE"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_STOCK_EXCHANGE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_STOCK_EXCHANGE",
     "Amount": "6",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_MEDIUM_INFLUENCE_BANK",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_BANK_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_BANK_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_BANK",
     "Amount": "4",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "4",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_MEDIUM_INFLUENCE_SHIPYARD",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_SHIPYARD_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_SHIPYARD_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_SHIPYARD",
     "Amount": "4",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "2"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_MARKET_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_MARKET_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_MARKET",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_SMALL_INFLUENCE_LIGHTHOUSE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_LIGHTHOUSE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_LIGHTHOUSE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_LIGHTHOUSE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_SINGAPORE": [
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_BONUS_PAPAL_PRIMACY_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_INDUSTRIAL_ZONE_PAPAL_PRIMACY"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_INDUSTRIAL_ZONE_PAPAL_PRIMACY",
    "collection": "COLLECTION_PLAYER_DISTRICTS",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "DistrictType": "DISTRICT_INDUSTRIAL_ZONE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_FOUNDED_OUR_RELIGION",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_FOUNDED_RELIGION_WITH_BELIEF",
      "inverse": false,
      "args": {
       "BeliefType": "BELIEF_PAPAL_PRIMACY"
      }
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_ETHIOPIA_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_ETHIOPIA_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_POWER_PLANT_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
    "args": {
     "Amount": "3"
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
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_LARGE_INFLUENCE_POWER_PLANT_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_POWER_PLANT_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
    "args": {
     "Amount": "3"
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
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_ETHIOPIA_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
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
        "BuildingType": "BUILDING_CONSULATE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_ETHIOPIA_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "BuildingType": "BUILDING_CONSULATE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_FACTORY_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_FACTORY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_FACTORY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
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
        "BuildingType": "BUILDING_FACTORY"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_MEDIUM_INFLUENCE_FACTORY_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_FACTORY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_FACTORY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "BuildingType": "BUILDING_FACTORY"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_BONUS_BUILDING_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
    "args": {
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_BONUS_DISTRICT_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
    "args": {
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_ETHIOPIA_BUILDING",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_WORKSHOP_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_BUILDING_PRODUCTION_FOR_WORKSHOP_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_BUILDING",
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
        "BuildingType": "BUILDING_WORKSHOP"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_INDUSTRIAL_SMALL_INFLUENCE_ETHIOPIA_DISTRICT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_WORKSHOP_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_INDUSTRIAL_DISTRICT_PRODUCTION_FOR_WORKSHOP_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_DISTRICT",
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
        "BuildingType": "BUILDING_WORKSHOP"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SINGAPORE_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SINGAPORE_PRODUCTION_PER_MAJOR_TRADE_PARTNER"
   },
   "attach": {
    "id": "MINOR_CIV_SINGAPORE_PRODUCTION_PER_MAJOR_TRADE_PARTNER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_PER_MAJOR_TRADE_PARTNER",
    "args": {
     "Amount": "2",
     "YieldType": "YIELD_PRODUCTION"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_TARUGA": [
  {
   "id": "MINOR_CIV_SCIENTIFIC_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_LARGE_INFLUENCE_RESEARCH_LAB",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_RESEARCH_LAB"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_RESEARCH_LAB",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_RESEARCH_LAB",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_MEDIUM_INFLUENCE_UNIVERSITY",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_UNIVERSITY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_UNIVERSITY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_UNIVERSITY",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_SCIENTIFIC_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_LIBRARY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_SCIENTIFIC_YIELD_FOR_LIBRARY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "BuildingType": "BUILDING_LIBRARY",
     "Amount": "1",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TARUGA_UNIQUE_INFLUENCE_ALUMINUM_RESOURCE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TARUGA_ALUMINUM_RESOURCE_SCIENCE"
   },
   "attach": {
    "id": "MINOR_CIV_TARUGA_ALUMINUM_RESOURCE_SCIENCE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_RESOURCE_TYPE_IMPROVED",
       "inverse": false,
       "args": {
        "ResourceType": "RESOURCE_ALUMINUM"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TARUGA_UNIQUE_INFLUENCE_COAL_RESOURCE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TARUGA_COAL_RESOURCE_SCIENCE"
   },
   "attach": {
    "id": "MINOR_CIV_TARUGA_COAL_RESOURCE_SCIENCE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_RESOURCE_TYPE_IMPROVED",
       "inverse": false,
       "args": {
        "ResourceType": "RESOURCE_COAL"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TARUGA_UNIQUE_INFLUENCE_HORSES_RESOURCE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TARUGA_HORSES_RESOURCE_SCIENCE"
   },
   "attach": {
    "id": "MINOR_CIV_TARUGA_HORSES_RESOURCE_SCIENCE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_RESOURCE_TYPE_IMPROVED",
       "inverse": false,
       "args": {
        "ResourceType": "RESOURCE_HORSES"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TARUGA_UNIQUE_INFLUENCE_IRON_RESOURCE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TARUGA_IRON_RESOURCE_SCIENCE"
   },
   "attach": {
    "id": "MINOR_CIV_TARUGA_IRON_RESOURCE_SCIENCE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_RESOURCE_TYPE_IMPROVED",
       "inverse": false,
       "args": {
        "ResourceType": "RESOURCE_IRON"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TARUGA_UNIQUE_INFLUENCE_NITER_RESOURCE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TARUGA_NITER_RESOURCE_SCIENCE"
   },
   "attach": {
    "id": "MINOR_CIV_TARUGA_NITER_RESOURCE_SCIENCE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_RESOURCE_TYPE_IMPROVED",
       "inverse": false,
       "args": {
        "ResourceType": "RESOURCE_NITER"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TARUGA_UNIQUE_INFLUENCE_OIL_RESOURCE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TARUGA_OIL_RESOURCE_SCIENCE"
   },
   "attach": {
    "id": "MINOR_CIV_TARUGA_OIL_RESOURCE_SCIENCE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_RESOURCE_TYPE_IMPROVED",
       "inverse": false,
       "args": {
        "ResourceType": "RESOURCE_OIL"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TARUGA_UNIQUE_INFLUENCE_URANIUM_RESOURCE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TARUGA_URANIUM_RESOURCE_SCIENCE"
   },
   "attach": {
    "id": "MINOR_CIV_TARUGA_URANIUM_RESOURCE_SCIENCE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_SCIENCE",
     "Amount": "5"
    },
    "subjectReqs": {
     "test": "ALL",
     "reqs": [
      {
       "type": "REQUIREMENT_CITY_HAS_RESOURCE_TYPE_IMPROVED",
       "inverse": false,
       "args": {
        "ResourceType": "RESOURCE_URANIUM"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_VALLETTA": [
  {
   "id": "MINOR_CIV_MILITARISTIC_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_LARGE_INFLUENCE_MILITARY_ACADEMY",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_MILITARY_ACADEMY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_MILITARY_ACADEMY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_MEDIUM_INFLUENCE_ARMORY",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_ARMORY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_ARMORY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
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
        "BuildingType": "BUILDING_ARMORY"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
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
        "BuildingType": "BUILDING_CONSULATE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
    "args": {
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_BARRACKS_STABLE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_BARRACKS_STABLE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
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
        "BuildingType": "BUILDING_BARRACKS"
       }
      },
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_STABLE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_VALLETTA_UNIQUE_INFLUENCE_CITY_CENTER_BUILDINGS_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_VALLETTA_CITY_CENTER_BUILDINGS_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_VALLETTA_CITY_CENTER_BUILDINGS_BONUS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ENABLE_BUILDING_FAITH_PURCHASE",
    "args": {
     "DistrictType": "DISTRICT_CITY_CENTER"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_VALLETTA_UNIQUE_INFLUENCE_ENCAMPMENT_BUILDINGS_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_VALLETTA_ENCAMPMENT_BUILDINGS_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_VALLETTA_ENCAMPMENT_BUILDINGS_BONUS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ENABLE_BUILDING_FAITH_PURCHASE",
    "args": {
     "DistrictType": "DISTRICT_ENCAMPMENT"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_VALLETTA_UNIQUE_INFLUENCE_PURCHASE_CHEAPER_CASTLE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_VALLETTA_PURCHASE_CHEAPER_CASTLE_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_VALLETTA_PURCHASE_CHEAPER_CASTLE_BONUS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_PURCHASE_COST",
    "args": {
     "BuildingType": "BUILDING_CASTLE",
     "Amount": "50"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_VALLETTA_UNIQUE_INFLUENCE_PURCHASE_CHEAPER_STAR_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_VALLETTA_PURCHASE_CHEAPER_STAR_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_VALLETTA_PURCHASE_CHEAPER_STAR_BONUS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_PURCHASE_COST",
    "args": {
     "BuildingType": "BUILDING_STAR_FORT",
     "Amount": "50"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_VALLETTA_UNIQUE_INFLUENCE_PURCHASE_CHEAPER_WALLS_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_VALLETTA_PURCHASE_CHEAPER_WALLS_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_VALLETTA_PURCHASE_CHEAPER_WALLS_BONUS",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_PURCHASE_COST",
    "args": {
     "BuildingType": "BUILDING_WALLS",
     "Amount": "50"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_VATICAN_CITY": [
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_CATHEDRAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CATHEDRAL"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CATHEDRAL",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_CATHEDRAL",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_DAR_E_MEHR",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_DAR_E_MEHR"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_DAR_E_MEHR",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_DAR_E_MEHR",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_GURDWARA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_GURDWARA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_GURDWARA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_GURDWARA",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_MEETING_HOUSE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MEETING_HOUSE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MEETING_HOUSE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_MEETING_HOUSE",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_MOSQUE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MOSQUE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MOSQUE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_MOSQUE",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_PAGODA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_PAGODA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_PAGODA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_PAGODA",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_STUPA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_STUPA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_STUPA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_STUPA",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_SYNAGOGUE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SYNAGOGUE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SYNAGOGUE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_SYNAGOGUE",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_WAT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_WAT"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_WAT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_WAT",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "2"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_MEDIUM_INFLUENCE_TEMPLE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_TEMPLE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_TEMPLE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_TEMPLE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SHRINE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SHRINE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_SHRINE",
     "Amount": "1",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_VATICAN_CITY_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_VATICAN_CITY_GREAT_PERSON_RELIGIOUS_PRESSURE"
   },
   "attach": {
    "id": "MINOR_CIV_VATICAN_CITY_GREAT_PERSON_RELIGIOUS_PRESSURE",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GRANT_PLAYER_RELIGIOUS_PRESSURE_GREAT_PERSON_ACTIVATED",
    "args": {
     "Amount": "400"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_VILNIUS": [
  {
   "id": "MINOR_CIV_CULTURAL_LARGE_INFLUENCE_BROADCAST_CENTER",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_BROADCAST_CENTER"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_BROADCAST_CENTER",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_BROADCAST_CENTER",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_MEDIUM_INFLUENCE_MUSEUM_ART",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ART"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ART",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_MUSEUM_ART",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_MEDIUM_INFLUENCE_MUSEUM_ARTIFACT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ARTIFACT"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_MUSEUM_ARTIFACT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_MUSEUM_ARTIFACT",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_CULTURAL_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_CULTURAL_YIELD_FOR_AMPHITHEATER_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_CULTURAL_YIELD_FOR_AMPHITHEATER_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "BuildingType": "BUILDING_AMPHITHEATER",
     "Amount": "1",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_VILNIUS_UNIQUE_INFLUENCE_ALLIANCE_LEVEL_1",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_VILNIUS_ALLIANCE_LEVEL_1"
   },
   "attach": {
    "id": "MINOR_CIV_VILNIUS_ALLIANCE_LEVEL_1",
    "collection": "COLLECTION_PLAYER_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "Amount": "50"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_HAS_ACTIVE_ALLIANCE_OF_AT_LEAST_LEVEL",
      "inverse": false,
      "args": {
       "Level": "1"
      }
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_VILNIUS_UNIQUE_INFLUENCE_ALLIANCE_LEVEL_2",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_VILNIUS_ALLIANCE_LEVEL_2"
   },
   "attach": {
    "id": "MINOR_CIV_VILNIUS_ALLIANCE_LEVEL_2",
    "collection": "COLLECTION_PLAYER_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "Amount": "50"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_HAS_ACTIVE_ALLIANCE_OF_AT_LEAST_LEVEL",
      "inverse": false,
      "args": {
       "Level": "2"
      }
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_VILNIUS_UNIQUE_INFLUENCE_ALLIANCE_LEVEL_3",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_VILNIUS_ALLIANCE_LEVEL_3"
   },
   "attach": {
    "id": "MINOR_CIV_VILNIUS_ALLIANCE_LEVEL_3",
    "collection": "COLLECTION_PLAYER_DISTRICTS",
    "effect": "EFFECT_ADJUST_DISTRICT_YIELD_MODIFIER",
    "args": {
     "YieldType": "YIELD_CULTURE",
     "Amount": "50"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_HAS_ACTIVE_ALLIANCE_OF_AT_LEAST_LEVEL",
      "inverse": false,
      "args": {
       "Level": "3"
      }
     }
    ]
   }
  }
 ],
 "CIVILIZATION_WOLIN": [
  {
   "id": "MINOR_CIV_MILITARISTIC_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_LARGE_INFLUENCE_MILITARY_ACADEMY",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_MILITARY_ACADEMY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_MILITARY_ACADEMY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
    "args": {
     "Amount": "3"
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
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_MEDIUM_INFLUENCE_ARMORY",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_ARMORY_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_ARMORY_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
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
        "BuildingType": "BUILDING_ARMORY"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
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
        "BuildingType": "BUILDING_CONSULATE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
    "args": {
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_MILITARISTIC_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_BARRACKS_STABLE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_MILITARISTIC_PRODUCTION_FOR_BARRACKS_STABLE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_CITY_PRODUCTION_UNIT",
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
        "BuildingType": "BUILDING_BARRACKS"
       }
      },
      {
       "type": "REQUIREMENT_CITY_HAS_BUILDING",
       "inverse": false,
       "args": {
        "BuildingType": "BUILDING_STABLE"
       }
      }
     ]
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_WOLIN_GREAT_ADMIRAL_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_WOLIN_GREAT_ADMIRAL_INFLUENCE_BONUS_MODIFIER"
   },
   "attach": {
    "id": "MINOR_CIV_WOLIN_GREAT_ADMIRAL_INFLUENCE_BONUS_MODIFIER",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_WOLIN_NAVAL_UNITS"
    },
    "ability": [
     {
      "id": "WOLIN_GREAT_ADMIRAL_POINTS",
      "collection": "COLLECTION_OWNER",
      "effect": "EFFECT_ADJUST_GREAT_PEOPLE_POINTS_PER_KILL_BY_DEFEATED_STRENGTH",
      "args": {
       "GreatPersonClassType": "GREAT_PERSON_CLASS_ADMIRAL",
       "Amount": "25"
      }
     }
    ]
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_WOLIN_GREAT_GENERAL_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_WOLIN_GREAT_GENERAL_INFLUENCE_BONUS_MODIFIER"
   },
   "attach": {
    "id": "MINOR_CIV_WOLIN_GREAT_GENERAL_INFLUENCE_BONUS_MODIFIER",
    "collection": "COLLECTION_PLAYER_UNITS",
    "effect": "EFFECT_GRANT_ABILITY",
    "args": {
     "AbilityType": "ABILITY_WOLIN_LAND_UNITS"
    },
    "ability": [
     {
      "id": "WOLIN_GREAT_GENERAL_POINTS",
      "collection": "COLLECTION_OWNER",
      "effect": "EFFECT_ADJUST_GREAT_PEOPLE_POINTS_PER_KILL_BY_DEFEATED_STRENGTH",
      "args": {
       "GreatPersonClassType": "GREAT_PERSON_CLASS_GENERAL",
       "Amount": "25"
      }
     }
    ]
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_YEREVAN": [
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_CATHEDRAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CATHEDRAL"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CATHEDRAL",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_CATHEDRAL",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_DAR_E_MEHR",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_DAR_E_MEHR"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_DAR_E_MEHR",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_DAR_E_MEHR",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_GURDWARA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_GURDWARA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_GURDWARA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_GURDWARA",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_MEETING_HOUSE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MEETING_HOUSE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MEETING_HOUSE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_MEETING_HOUSE",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_MOSQUE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MOSQUE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_MOSQUE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_MOSQUE",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_PAGODA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_PAGODA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_PAGODA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_PAGODA",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_STUPA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_STUPA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_STUPA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_STUPA",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_SYNAGOGUE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SYNAGOGUE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SYNAGOGUE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_SYNAGOGUE",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_LARGE_INFLUENCE_WAT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_WAT"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_WAT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_WAT",
     "Amount": "3",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "2"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_MEDIUM_INFLUENCE_TEMPLE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_TEMPLE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_TEMPLE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_TEMPLE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_RELIGIOUS_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SHRINE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_RELIGIOUS_YIELD_FOR_SHRINE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_FAITH",
     "BuildingType": "BUILDING_SHRINE",
     "Amount": "1",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_YEREVAN_UNIQUE_INFLUENCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_YEREVAN_APOSTLE_PROMOTION_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_YEREVAN_APOSTLE_PROMOTION_BONUS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_GRANT_UNIT_TYPE_UNLIMITED_PROMOTION_CHOICES",
    "args": {
     "UnitType": "UNIT_APOSTLE"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ],
 "CIVILIZATION_ZANZIBAR": [
  {
   "id": "MINOR_CIV_TRADE_LARGE_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_CHANCERY"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_CHANCERY",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_CHANCERY",
     "Amount": "6",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_LARGE_INFLUENCE_SEAPORT",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_SEAPORT"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_SEAPORT",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_SEAPORT",
     "Amount": "6",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_LARGE_INFLUENCE_STOCK_EXCHANGE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_STOCK_EXCHANGE"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_STOCK_EXCHANGE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_STOCK_EXCHANGE",
     "Amount": "6",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "6"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_MEDIUM_INFLUENCE_BANK",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_BANK_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_BANK_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_BANK",
     "Amount": "4",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_MEDIUM_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_CONSULATE"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_CONSULATE",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_CONSULATE",
     "Amount": "4",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_MEDIUM_INFLUENCE_SHIPYARD",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_SHIPYARD_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_SHIPYARD_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_SHIPYARD",
     "Amount": "4",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "3"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_SMALL_INFLUENCE_CAPITAL",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_CAPITAL_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_CAPITAL_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CAPITAL_CITY",
    "effect": "EFFECT_ADJUST_CITY_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "Amount": "2"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_SMALL_INFLUENCE_ETHIOPIA",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_MARKET_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_MARKET_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_MARKET",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_TRADE_SMALL_INFLUENCE_LIGHTHOUSE",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_TRADE_YIELD_FOR_LIGHTHOUSE_ETHIOPIA"
   },
   "attach": {
    "id": "MINOR_CIV_TRADE_YIELD_FOR_LIGHTHOUSE_ETHIOPIA",
    "collection": "COLLECTION_PLAYER_CITIES",
    "effect": "EFFECT_ADJUST_BUILDING_YIELD_CHANGE",
    "args": {
     "YieldType": "YIELD_GOLD",
     "BuildingType": "BUILDING_LIGHTHOUSE",
     "Amount": "2",
     "CityStatesOnly": "true"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS",
      "inverse": false,
      "args": {
       "MinimumTokens": "1"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_ZANZIBAR_UNIQUE_INFLUENCE_CINNAMON_RESOURCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_ZANZIBAR_CINNAMON_RESOURCE_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_ZANZIBAR_CINNAMON_RESOURCE_BONUS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_FREE_RESOURCE_IMPORT",
    "args": {
     "ResourceType": "RESOURCE_CINNAMON",
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "MINOR_CIV_ZANZIBAR_UNIQUE_INFLUENCE_CLOVES_RESOURCE_BONUS",
   "collection": "COLLECTION_ALL_PLAYERS",
   "effect": "EFFECT_ATTACH_MODIFIER",
   "args": {
    "ModifierId": "MINOR_CIV_ZANZIBAR_CLOVES_RESOURCE_BONUS"
   },
   "attach": {
    "id": "MINOR_CIV_ZANZIBAR_CLOVES_RESOURCE_BONUS",
    "collection": "COLLECTION_OWNER",
    "effect": "EFFECT_ADJUST_PLAYER_FREE_RESOURCE_IMPORT",
    "args": {
     "ResourceType": "RESOURCE_CLOVES",
     "Amount": "1"
    }
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
      "inverse": false,
      "args": {}
     },
     {
      "type": "REQUIREMENT_PLAYER_IS_SUZERAIN_BONUS_ENABLED",
      "inverse": false,
      "args": {}
     }
    ]
   }
  }
 ]
};
export const AI_SPACE_RACE_PROJECTS: readonly string[] = [
 "PROJECT_LAUNCH_EARTH_SATELLITE",
 "PROJECT_LAUNCH_MOON_LANDING",
 "PROJECT_LAUNCH_MARS_BASE",
 "PROJECT_LAUNCH_EXOPLANET_EXPEDITION",
 "PROJECT_ORBITAL_LASER",
 "PROJECT_TERRESTRIAL_LASER"
];
export const AI_DEFAULT_SAVINGS: readonly { saving: string; weight: number }[] = [
 {
  "saving": "SAVING_SLUSH_FUND",
  "weight": 3
 },
 {
  "saving": "SAVING_UNITS",
  "weight": 4
 },
 {
  "saving": "SAVING_PLOTS",
  "weight": 1
 },
 {
  "saving": "SAVING_GREAT_PEOPLE",
  "weight": 1
 }
];
