/**
 * THE AI VALUE LAYER'S TABLES (cpu/core/aiValue.ts), written by
 * tools/install/ai_tables.py from the layered install (`--check` reports a
 * stale file): the yields' and pseudo-yields' DefaultValue, the great
 * person classes' pseudo-yields, the governments' InfluencePointsThreshold,
 * and the AI lists the weights sum: System Yields and YieldSensitivities by
 * trait — a leader's traits through its InheritFrom chain, a civilization's
 * —, those and PseudoYields by strategy (Strategy_Priorities).
 */
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
