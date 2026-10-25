/**
 * THE AI VALUE LAYER'S TABLES (cpu/core/aiValue.ts), written by
 * tools/install/ai_tables.py from the layered install (`--check` reports a
 * stale file): the yields' and pseudo-yields' DefaultValue, the great
 * person classes' pseudo-yields, the governments' InfluencePointsThreshold,
 * and the AI lists the weights sum: System Yields and YieldSensitivities by
 * trait — a leader's traits through its InheritFrom chain, a
 * civilization's; the city-states' modifiers their envoys reach, the
 * civics' modifiers (CivicModifiers), the technologies' modifiers
 * (TechnologyModifiers); the policies and governments in DATABASE ORDER
 * (the index the game's AI loops walk), the slot types, the great person
 * classes.
 */
import type { AiModifier } from '../core/aiModifiers';
import type { AiListRef, AiListItem } from '../core/aiValue';
import type { AiGovernment, AiPolicy, AiSlotType } from '../core/aiPolicyValue';

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
 "BasilFavoredYields": [
  {
   "item": "YIELD_FAITH",
   "value": 33,
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
 "IndustrialRevolutionPreference": [
  {
   "item": "YIELD_PRODUCTION",
   "value": 20,
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
 "MoneyGrubberGoldPreference": [
  {
   "item": "YIELD_GOLD",
   "value": 20,
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
 "ScienceLoverSciencePreference": [
  {
   "item": "YIELD_SCIENCE",
   "value": 20,
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
export const AI_CIVIC_MODIFIERS: Readonly<Record<string, readonly AiModifier[]>> = {
 "CIVIC_CIVIL_ENGINEERING": [
  {
   "id": "CIVIC_GRANT_PLAYER_GOVERNOR_POINTS",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_ADJUST_PLAYER_GOVERNOR_POINTS",
   "args": {
    "Delta": "1"
   }
  }
 ],
 "CIVIC_COLD_WAR": [
  {
   "id": "CIVIC_GRANT_SPY",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_GRANT_SPY",
   "args": {
    "Amount": "1"
   }
  }
 ],
 "CIVIC_COLONIALISM": [
  {
   "id": "CIVIC_AWARD_TWO_INFLUENCE_TOKENS",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_GRANT_INFLUENCE_TOKEN",
   "args": {
    "Amount": "2"
   }
  }
 ],
 "CIVIC_CONSERVATION": [
  {
   "id": "CIVIC_AWARD_THREE_INFLUENCE_TOKENS",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_GRANT_INFLUENCE_TOKEN",
   "args": {
    "Amount": "3"
   }
  },
  {
   "id": "CONSERVATION_ANCIENT_WALL_TOURISM",
   "collection": "COLLECTION_PLAYER_DISTRICTS",
   "effect": "EFFECT_ADJUST_DISTRICT_TOURISM_CHANGE",
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
       "DistrictType": "DISTRICT_CITY_CENTER"
      }
     },
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
   "id": "CONSERVATION_MEDIEVAL_WALL_TOURISM",
   "collection": "COLLECTION_PLAYER_DISTRICTS",
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
       "DistrictType": "DISTRICT_CITY_CENTER"
      }
     },
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
   "id": "CONSERVATION_RENAISSANCE_WALL_TOURISM",
   "collection": "COLLECTION_PLAYER_DISTRICTS",
   "effect": "EFFECT_ADJUST_DISTRICT_TOURISM_CHANGE",
   "args": {
    "Amount": "3"
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_DISTRICT_TYPE_MATCHES",
      "inverse": false,
      "args": {
       "DistrictType": "DISTRICT_CITY_CENTER"
      }
     },
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
   "id": "CONSERVATION_TSIKHE_TOURISM_GOLDEN_AGE",
   "collection": "COLLECTION_PLAYER_DISTRICTS",
   "effect": "EFFECT_ADJUST_DISTRICT_TOURISM_CHANGE",
   "args": {
    "Amount": "3"
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_DISTRICT_TYPE_MATCHES",
      "inverse": false,
      "args": {
       "DistrictType": "DISTRICT_CITY_CENTER"
      }
     },
     {
      "type": "REQUIREMENT_CITY_HAS_BUILDING",
      "inverse": false,
      "args": {
       "BuildingType": "BUILDING_TSIKHE"
      }
     },
     {
      "type": "REQUIREMENT_PLAYER_HAS_GOLDEN_AGE",
      "inverse": false,
      "args": {}
     }
    ]
   }
  },
  {
   "id": "CONSERVATION_ARENA_TOURISM",
   "collection": "COLLECTION_PLAYER_DISTRICTS",
   "effect": "EFFECT_ADJUST_DISTRICT_TOURISM_CHANGE",
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
       "DistrictType": "DISTRICT_ENTERTAINMENT_COMPLEX"
      }
     },
     {
      "type": "REQUIREMENT_CITY_HAS_BUILDING",
      "inverse": false,
      "args": {
       "BuildingType": "BUILDING_ARENA"
      }
     }
    ]
   }
  }
 ],
 "CIVIC_CULTURAL_HERITAGE": [
  {
   "id": "CIVIC_AWARD_THREE_INFLUENCE_TOKENS",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_GRANT_INFLUENCE_TOKEN",
   "args": {
    "Amount": "3"
   }
  },
  {
   "id": "CIVIC_GENERATE_SEA_ANTIQUITIES",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_TRIGGER_GAME_MECHANIC",
   "args": {
    "MechanicName": "GenerateSeaAntiquities"
   }
  },
  {
   "id": "CIVIC_EXTRACT_SEA_ARTIFACTS",
   "collection": "COLLECTION_PLAYER_UNITS",
   "effect": "EFFECT_ADJUST_UNIT_EXTRACT_SEA_ARTIFACTS",
   "args": {
    "Extract": "true"
   }
  }
 ],
 "CIVIC_DEFENSIVE_TACTICS": [
  {
   "id": "CIVIC_GRANT_PLAYER_GOVERNOR_POINTS",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_ADJUST_PLAYER_GOVERNOR_POINTS",
   "args": {
    "Delta": "1"
   }
  }
 ],
 "CIVIC_DIPLOMATIC_SERVICE": [
  {
   "id": "CIVIC_GRANT_SPY",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_GRANT_SPY",
   "args": {
    "Amount": "1"
   }
  }
 ],
 "CIVIC_EARLY_EMPIRE": [
  {
   "id": "CIVIC_ENFORCE_BORDERS",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_ADJUST_PLAYER_ENFORCE_BORDERS",
   "args": {
    "Enable": "true"
   }
  },
  {
   "id": "CIVIC_GRANT_PLAYER_GOVERNOR_POINTS",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_ADJUST_PLAYER_GOVERNOR_POINTS",
   "args": {
    "Delta": "1"
   }
  }
 ],
 "CIVIC_ENVIRONMENTALISM": [
  {
   "id": "ENVIRONMENTALISM_BOOST_ALL_TOURISM",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_ADJUST_PLAYER_TOURISM",
   "args": {
    "Amount": "25"
   }
  }
 ],
 "CIVIC_FOREIGN_TRADE": [
  {
   "id": "CIVIC_GRANT_ONE_TRADE_ROUTE",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_ADJUST_TRADE_ROUTE_CAPACITY",
   "args": {
    "Amount": "1"
   }
  }
 ],
 "CIVIC_FUTURE_CIVIC": [
  {
   "id": "CIVIC_GRANT_PLAYER_GOVERNOR_POINTS",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_ADJUST_PLAYER_GOVERNOR_POINTS",
   "args": {
    "Delta": "1"
   }
  },
  {
   "id": "CIVIC_GRANT_FAVOR",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_ADD_PLAYER_FAVOR",
   "args": {
    "Amount": "50"
   }
  }
 ],
 "CIVIC_GLOBALIZATION": [
  {
   "id": "CIVIC_GRANT_PLAYER_GOVERNOR_POINTS",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_ADJUST_PLAYER_GOVERNOR_POINTS",
   "args": {
    "Delta": "1"
   }
  }
 ],
 "CIVIC_GLOBAL_WARMING_MITIGATION": [
  {
   "id": "CIVIC_AWARD_THREE_INFLUENCE_TOKENS",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_GRANT_INFLUENCE_TOKEN",
   "args": {
    "Amount": "3"
   }
  },
  {
   "id": "CIVIC_MITIGATION_GRANT_DIPLOVP",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_ADJUST_PLAYER_DIPLOMATIC_VICTORY_POINTS",
   "args": {
    "Amount": "1",
    "Tooltip": "LOC_DVP_TOOLTIP_OTHER_SOURCES"
   }
  }
 ],
 "CIVIC_GUILDS": [
  {
   "id": "CIVIC_GRANT_PLAYER_GOVERNOR_POINTS",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_ADJUST_PLAYER_GOVERNOR_POINTS",
   "args": {
    "Delta": "1"
   }
  }
 ],
 "CIVIC_IDEOLOGY": [
  {
   "id": "CIVIC_GRANT_SPY",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_GRANT_SPY",
   "args": {
    "Amount": "1"
   }
  }
 ],
 "CIVIC_MASS_MEDIA": [
  {
   "id": "CIVIC_GRANT_PLAYER_GOVERNOR_POINTS",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_ADJUST_PLAYER_GOVERNOR_POINTS",
   "args": {
    "Delta": "1"
   }
  }
 ],
 "CIVIC_MEDIEVAL_FAIRES": [
  {
   "id": "CIVIC_GRANT_PLAYER_GOVERNOR_POINTS",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_ADJUST_PLAYER_GOVERNOR_POINTS",
   "args": {
    "Delta": "1"
   }
  }
 ],
 "CIVIC_MERCENARIES": [
  {
   "id": "CIVIC_AWARD_ONE_INFLUENCE_TOKEN",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_GRANT_INFLUENCE_TOKEN",
   "args": {
    "Amount": "1"
   }
  }
 ],
 "CIVIC_MILITARY_TRADITION": [
  {
   "id": "CIVIC_GRANT_COMBAT_ADJACENCY_BONUS",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_GRANT_COMBAT_ADJACENCY",
   "args": {
    "Enable": "true"
   }
  }
 ],
 "CIVIC_MILITARY_TRAINING": [
  {
   "id": "CIVIC_AWARD_ONE_INFLUENCE_TOKEN",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_GRANT_INFLUENCE_TOKEN",
   "args": {
    "Amount": "1"
   }
  }
 ],
 "CIVIC_MOBILIZATION": [
  {
   "id": "CIVIC_GRANT_PLAYER_GOVERNOR_POINTS",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_ADJUST_PLAYER_GOVERNOR_POINTS",
   "args": {
    "Delta": "1"
   }
  }
 ],
 "CIVIC_MYSTICISM": [
  {
   "id": "CIVIC_AWARD_ONE_INFLUENCE_TOKEN",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_GRANT_INFLUENCE_TOKEN",
   "args": {
    "Amount": "1"
   }
  }
 ],
 "CIVIC_NATIONALISM": [
  {
   "id": "CIVIC_GRANT_SPY",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_GRANT_SPY",
   "args": {
    "Amount": "1"
   }
  },
  {
   "id": "CIVIC_GRANT_PLAYER_GOVERNOR_POINTS",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_ADJUST_PLAYER_GOVERNOR_POINTS",
   "args": {
    "Delta": "1"
   }
  }
 ],
 "CIVIC_NATURAL_HISTORY": [
  {
   "id": "CIVIC_AWARD_TWO_INFLUENCE_TOKENS",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_GRANT_INFLUENCE_TOKEN",
   "args": {
    "Amount": "2"
   }
  },
  {
   "id": "CIVIC_GENERATE_LAND_ANTIQUITIES",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_TRIGGER_GAME_MECHANIC",
   "args": {
    "MechanicName": "GenerateLandAntiquities"
   }
  }
 ],
 "CIVIC_NAVAL_TRADITION": [
  {
   "id": "CIVIC_AWARD_ONE_INFLUENCE_TOKEN",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_GRANT_INFLUENCE_TOKEN",
   "args": {
    "Amount": "1"
   }
  }
 ],
 "CIVIC_NEAR_FUTURE_GOVERNANCE": [
  {
   "id": "CIVIC_GRANT_PLAYER_GOVERNOR_POINTS",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_ADJUST_PLAYER_GOVERNOR_POINTS",
   "args": {
    "Delta": "1"
   }
  },
  {
   "id": "CIVIC_AWARD_THREE_INFLUENCE_TOKENS",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_GRANT_INFLUENCE_TOKEN",
   "args": {
    "Amount": "3"
   }
  }
 ],
 "CIVIC_OPERA_BALLET": [
  {
   "id": "CIVIC_AWARD_TWO_INFLUENCE_TOKENS",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_GRANT_INFLUENCE_TOKEN",
   "args": {
    "Amount": "2"
   }
  }
 ],
 "CIVIC_RECORDED_HISTORY": [
  {
   "id": "CIVIC_GRANT_PLAYER_GOVERNOR_POINTS",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_ADJUST_PLAYER_GOVERNOR_POINTS",
   "args": {
    "Delta": "1"
   }
  }
 ],
 "CIVIC_SCORCHED_EARTH": [
  {
   "id": "CIVIC_AWARD_TWO_INFLUENCE_TOKENS",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_GRANT_INFLUENCE_TOKEN",
   "args": {
    "Amount": "2"
   }
  }
 ],
 "CIVIC_SOCIAL_MEDIA": [
  {
   "id": "CIVIC_GRANT_PLAYER_GOVERNOR_POINTS",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_ADJUST_PLAYER_GOVERNOR_POINTS",
   "args": {
    "Delta": "1"
   }
  }
 ],
 "CIVIC_STATE_WORKFORCE": [
  {
   "id": "CIVIC_GRANT_PLAYER_GOVERNOR_POINTS",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_ADJUST_PLAYER_GOVERNOR_POINTS",
   "args": {
    "Delta": "1"
   }
  }
 ],
 "CIVIC_THEOLOGY": [
  {
   "id": "CIVIC_AWARD_ONE_INFLUENCE_TOKEN",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_GRANT_INFLUENCE_TOKEN",
   "args": {
    "Amount": "1"
   }
  }
 ],
 "CIVIC_THE_ENLIGHTENMENT": [
  {
   "id": "CIVIC_REDUCE_RELIGIOUS_TOURISM",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_ADJUST_PLAYER_RELIGIOUS_TOURISM_REDUCTION",
   "args": {
    "Modifier": "50"
   }
  }
 ]
};
export const AI_TECH_MODIFIERS: Readonly<Record<string, readonly AiModifier[]>> = {
 "TECH_ADVANCED_AI": [
  {
   "id": "GDR_AA_DEFENSE_UPGRADE",
   "collection": "COLLECTION_PLAYER_UNITS",
   "effect": "EFFECT_GRANT_PROMOTION",
   "args": {
    "PromotionType": "PROMOTION_GDR_AA_DEFENSE"
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_UNIT_TAG_MATCHES",
      "inverse": false,
      "args": {
       "Tag": "CLASS_GIANT_DEATH_ROBOT"
      }
     }
    ]
   }
  }
 ],
 "TECH_ADVANCED_POWER_CELLS": [
  {
   "id": "GDR_SIEGE_LASER_UPGRADE",
   "collection": "COLLECTION_PLAYER_UNITS",
   "effect": "EFFECT_GRANT_PROMOTION",
   "args": {
    "PromotionType": "PROMOTION_GDR_SIEGE_LASER"
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_UNIT_TAG_MATCHES",
      "inverse": false,
      "args": {
       "Tag": "CLASS_GIANT_DEATH_ROBOT"
      }
     }
    ]
   }
  },
  {
   "id": "UNIT_CO2_REDUCTION",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_ADJUST_CO2_GENERATION_REDUCTION",
   "args": {
    "Amount": "50",
    "ResourceUsageType": "RESOURCE_USAGE_UNIT"
   }
  }
 ],
 "TECH_CARTOGRAPHY": [
  {
   "id": "CARTOGRAPHY_GRANT_OCEAN_NAVIGATION",
   "collection": "COLLECTION_PLAYER_UNITS",
   "effect": "EFFECT_ADJUST_UNIT_VALID_TERRAIN",
   "args": {
    "TerrainType": "TERRAIN_OCEAN",
    "Valid": "true"
   }
  }
 ],
 "TECH_COMBUSTION": [
  {
   "id": "COMBUSTION_ADJUST_EMBARKED_MOVEMENT",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_ADJUST_PLAYER_EMBARKED_UNIT_MOVEMENT",
   "args": {
    "Amount": "1"
   }
  }
 ],
 "TECH_COMPUTERS": [
  {
   "id": "TECH_GRANT_SPY",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_GRANT_SPY",
   "args": {
    "Amount": "1"
   }
  },
  {
   "id": "COMPUTERS_BOOST_ALL_TOURISM",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_ADJUST_PLAYER_TOURISM",
   "args": {
    "Amount": "25"
   }
  }
 ],
 "TECH_CYBERNETICS": [
  {
   "id": "GDR_BONUS_MOVEMENT_UPGRADE",
   "collection": "COLLECTION_PLAYER_UNITS",
   "effect": "EFFECT_GRANT_PROMOTION",
   "args": {
    "PromotionType": "PROMOTION_GDR_BONUS_MOVEMENT"
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_UNIT_TAG_MATCHES",
      "inverse": false,
      "args": {
       "Tag": "CLASS_GIANT_DEATH_ROBOT"
      }
     }
    ]
   }
  }
 ],
 "TECH_FUTURE_TECH": [
  {
   "id": "FUTURE_TECH_PROJECT_PRODUCTION",
   "collection": "COLLECTION_PLAYER_CITIES",
   "effect": "EFFECT_ADJUST_ALL_PROJECTS_PRODUCTION",
   "args": {
    "Amount": "5"
   }
  }
 ],
 "TECH_MATHEMATICS": [
  {
   "id": "MATHEMATICS_ADJUST_SEA_MOVEMENT",
   "collection": "COLLECTION_PLAYER_UNITS",
   "effect": "EFFECT_ADJUST_UNIT_SEA_MOVEMENT",
   "args": {
    "Amount": "1"
   }
  }
 ],
 "TECH_PRINTING": [
  {
   "id": "PRINTING_ADD_DIPLO_VISIBILITY",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_ADD_DIPLO_VISIBILITY",
   "args": {
    "Amount": "1",
    "Source": "SOURCE_TECH",
    "SourceType": "DIPLO_SOURCE_ALL_NAMES"
   }
  },
  {
   "id": "PRINTING_BOOST_WRITING_TOURISM",
   "collection": "COLLECTION_PLAYER_CITIES",
   "effect": "EFFECT_ADJUST_CITY_TOURISM",
   "args": {
    "GreatWorkObjectType": "GREATWORKOBJECT_WRITING",
    "ScalingFactor": "200"
   }
  }
 ],
 "TECH_SEASTEADS": [
  {
   "id": "TECH_SEASTEADS_DIPLOVP",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_ADJUST_PLAYER_DIPLOMATIC_VICTORY_POINTS",
   "args": {
    "Amount": "1",
    "Tooltip": "LOC_DVP_TOOLTIP_OTHER_SOURCES"
   }
  }
 ],
 "TECH_SMART_MATERIALS": [
  {
   "id": "GDR_ARMOR_UPGRADE",
   "collection": "COLLECTION_PLAYER_UNITS",
   "effect": "EFFECT_GRANT_PROMOTION",
   "args": {
    "PromotionType": "PROMOTION_GDR_ARMOR_UPGRADE"
   },
   "subjectReqs": {
    "test": "ALL",
    "reqs": [
     {
      "type": "REQUIREMENT_UNIT_TAG_MATCHES",
      "inverse": false,
      "args": {
       "Tag": "CLASS_GIANT_DEATH_ROBOT"
      }
     }
    ]
   }
  }
 ],
 "TECH_SQUARE_RIGGING": [
  {
   "id": "SQUARE_RIGGING_ADJUST_EMBARKED_MOVEMENT",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_ADJUST_PLAYER_EMBARKED_UNIT_MOVEMENT",
   "args": {
    "Amount": "1"
   }
  }
 ],
 "TECH_STEAM_POWER": [
  {
   "id": "STEAM_POWER_ADJUST_EMBARKED_MOVEMENT",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_ADJUST_PLAYER_EMBARKED_UNIT_MOVEMENT",
   "args": {
    "Amount": "2"
   }
  }
 ],
 "TECH_STEEL": [
  {
   "id": "STEEL_UNLOCK_URBAN_DEFENSES",
   "collection": "COLLECTION_OWNER",
   "effect": "EFFECT_ADJUST_CITIES_HAS_URBAN_DEFENSES",
   "args": {
    "DefenseValue": "400"
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
export const AI_GREAT_PERSON_CLASSES: readonly string[] = [
 "GREAT_PERSON_CLASS_GENERAL",
 "GREAT_PERSON_CLASS_ADMIRAL",
 "GREAT_PERSON_CLASS_ENGINEER",
 "GREAT_PERSON_CLASS_MERCHANT",
 "GREAT_PERSON_CLASS_PROPHET",
 "GREAT_PERSON_CLASS_SCIENTIST",
 "GREAT_PERSON_CLASS_WRITER",
 "GREAT_PERSON_CLASS_ARTIST",
 "GREAT_PERSON_CLASS_MUSICIAN",
 "GREAT_PERSON_CLASS_COMANDANTE_GENERAL"
];
