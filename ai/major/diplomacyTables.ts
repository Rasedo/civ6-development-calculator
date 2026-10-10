/**
 * THE MAJORS' DIPLOMACY TABLES, written by tools/install/ai_diplomacy_tables.py
 * from the layered install (`--check` reports a stale file). Agendas run in
 * DATABASE ORDER, the order the random agenda pool walks within a tag.
 */
import type { DiploModifierRow, DiploRequirementSet } from './diplomacyTypes';

export const DIPLO_STANDARD_MODIFIERS: readonly DiploModifierRow[] = [
 {
  "id": "STANDARD_DIPLOMATIC_ALLY",
  "type": "SIMPLE_MODIFIER",
  "owner": null,
  "subject": "PLAYER_ALLY",
  "args": {
   "InitialValue": "18",
   "ReductionTurns": "10",
   "ReductionValue": "1",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_ALLY"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_ARCHAEOLOGY",
  "type": "ARCHAEOLOGY",
  "owner": "ON_TURN_STARTED",
  "subject": "PLAYER_IS_KNOWN_MAJOR_CIV",
  "args": {
   "InitialValue": "0",
   "IncrementValue": "0",
   "ModifierPerTransgression": "-5",
   "DiplomacyKey": "WARNING_STOP_DIGGING_UP_ARTIFACTS",
   "MessageThrottle": "20",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_STOP_DIGGING_UP_ARTIFACTS_WARNING"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_CONVERTED_CITY",
  "type": "SIMPLE_MODIFIER",
  "owner": null,
  "subject": "PLAYER_CITY_CONVERTED",
  "args": {
   "InitialValue": "-9",
   "ReductionTurns": "10",
   "ReductionValue": "-1",
   "DiplomacyKey": "WARNING_STOP_CONVERTING_MY_CITIES",
   "MessageThrottle": "20",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_CITY_CONVERTED"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_CULTURE_BOMBED",
  "type": "SIMPLE_MODIFIER",
  "owner": null,
  "subject": "PLAYER_CULTURE_BOMBED",
  "args": {
   "InitialValue": "-10",
   "ReductionTurns": "10",
   "ReductionValue": "-1",
   "Accumulates": "true",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_CULTURE_BOMBED"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_DECLARED_FRIEND",
  "type": "SIMPLE_MODIFIER",
  "owner": null,
  "subject": "PLAYER_DECLARED_FRIEND",
  "args": {
   "InitialValue": "9",
   "ReductionTurns": "10",
   "ReductionValue": "1",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DECLARED_FRIEND"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_DEFENSIVE_PACT",
  "type": "SIMPLE_MODIFIER",
  "owner": null,
  "subject": "PLAYER_DEFENSIVE_PACT",
  "args": {
   "InitialValue": "9",
   "ReductionTurns": "-1",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DEFENSIVE_PACT"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_DELEGATION",
  "type": "SIMPLE_MODIFIER",
  "owner": null,
  "subject": "PLAYER_DELEGATION",
  "args": {
   "InitialValue": "3",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DELEGATION"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_DEMAND",
  "type": "SIMPLE_MODIFIER",
  "owner": null,
  "subject": "PLAYER_RECEIVED_DEMAND",
  "args": {
   "InitialValue": "-5",
   "Accumulates": "true",
   "ReductionTurns": "5",
   "ReductionValue": "1",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DEMAND"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_DENOUNCED",
  "type": "SIMPLE_MODIFIER",
  "owner": null,
  "subject": "PLAYER_DENOUNCED",
  "args": {
   "InitialValue": "-9",
   "ReductionTurns": "10",
   "ReductionValue": "-1",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DENOUNCED"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_ESPIONAGE",
  "type": "ESPIONAGE",
  "owner": null,
  "subject": "ON_ESPIONAGE_DETECTED",
  "args": {
   "InitialValue": "0",
   "IncrementValue": "0",
   "ModifierPerTransgression": "-5",
   "ReductionTurns": "15",
   "ReductionValue": "1",
   "DiplomacyKey": "WARNING_STOP_SPYING_ON_ME",
   "MessageThrottle": "20",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_STOP_SPYING_ON_ME_WARNING"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_HAD_FRIENDLY_MEETING",
  "type": "SIMPLE_MODIFIER",
  "owner": null,
  "subject": "PLAYER_HAD_FRIENDLY_MEETING",
  "args": {
   "InitialValue": "2",
   "ReductionTurns": "10",
   "ReductionValue": "1",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_HAD_FRIENDLY_MEETING"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_GOVERNMENT_SAME",
  "type": "GOVERNMENTS",
  "owner": null,
  "subject": "PLAYER_HAS_SAME_GOVERNMENT",
  "args": {
   "SimpleModifierDescription": "LOC_TOOLTIP_SAMPLE_DIPLOMACY_GOVERNMENT_SAME"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_GOVERNMENT_DIFFERENT",
  "type": "GOVERNMENTS",
  "owner": null,
  "subject": "PLAYER_HAS_DIFFERENT_GOVERNMENT",
  "args": {
   "SimpleModifierDescription": "LOC_TOOLTIP_SAMPLE_DIPLOMACY_GOVERNMENT_DIFFERENT",
   "IncrementTurns": "1",
   "IncrementValue": "-1"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_INCURSION",
  "type": "INCURSION",
  "owner": "ON_TURN_STARTED",
  "subject": "PLAYER_IS_KNOWN_BUT_NO_OPEN_BORDERS",
  "args": {
   "InitialValue": "0",
   "IncrementValue": "0",
   "ReductionValue": "1"
  }
 },
 {
  "id": "STANDARD_DIPLOMACY_JOINT_WAR",
  "type": "SIMPLE_MODIFIER",
  "owner": null,
  "subject": "PLAYER_DECLARES_JOINT_WAR",
  "args": {
   "InitialValue": "5",
   "ReductionTurns": "20",
   "ReductionValue": "1",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_JOINT_WAR"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_NEAR_BORDER_WARNING",
  "type": "SIMPLE_MODIFIER",
  "owner": null,
  "subject": "PLAYER_NEAR_CULTURE_BORDER",
  "args": {
   "InitialValue": "-2",
   "ReductionTurns": "10",
   "ReductionValue": "-1",
   "DiplomacyKey": "WARNING_TOO_MANY_TROOPS_NEAR_ME",
   "MessageThrottle": "20",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_NEAR_BORDER_WARNING"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_LIBERATED_MY_CITY",
  "type": "SIMPLE_MODIFIER",
  "owner": null,
  "subject": "PLAYER_MY_CITY_LIBERATED",
  "args": {
   "InitialValue": "20",
   "ReductionTurns": "20",
   "ReductionValue": "1",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_LIBERATED_MY_CITY"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_OCCUPIED_CITY",
  "type": "SIMPLE_MODIFIER",
  "owner": null,
  "subject": "PLAYER_CITY_OCCUPIED",
  "args": {
   "InitialValue": "-18",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_CITY_OCCUPIED",
   "OnlyOwnersCity": "true"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_OCCUPIED_FRIENDLY_CITY",
  "type": "SIMPLE_MODIFIER",
  "owner": null,
  "subject": "PLAYER_CITY_OCCUPIED_FRIEND",
  "args": {
   "InitialValue": "-9",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_CITY_OCCUPIED_FRIEND"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_ONE_SIDED_TRADES",
  "type": "ONE_SIDED_TRADES",
  "owner": null,
  "subject": "ON_DEAL_ENACTED",
  "args": {
   "IncrementValue": "0",
   "MaxValue": "20",
   "ReductionValue": "1",
   "ReductionTurns": "2",
   "TradeValuePerModifierPoint": "10"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_OPEN_BORDERS",
  "type": "SIMPLE_MODIFIER",
  "owner": null,
  "subject": "PLAYER_OPEN_BORDERS",
  "args": {
   "InitialValue": "3",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_OPEN_BORDERS"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_RAZED_MY_CITY",
  "type": "SIMPLE_MODIFIER",
  "owner": null,
  "subject": "PLAYER_MY_CITY_RAZED",
  "args": {
   "InitialValue": "-20",
   "ReductionTurns": "20",
   "Accumulates": "true",
   "ReductionValue": "-1",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_RAZED_MY_CITY"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_RELIGION_ACCEPT_CONVERSION",
  "type": "SIMPLE_MODIFIER",
  "owner": null,
  "subject": "PLAYER_ACCEPT_CONVERSION",
  "args": {
   "InitialValue": "5",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_SHARED_RELIGION"
  }
 },
 {
  "id": "STANDARD_DIPLOMACY_PEACE",
  "type": "PEACEFUL",
  "owner": null,
  "subject": "PLAYER_IS_AT_PEACE",
  "args": {
   "InitialValue": "0",
   "MaxValue": "5",
   "IncrementValue": "1",
   "IncrementTurns": "25",
   "SimpleModifierDescription": "LOC_TOOLTIP_SAMPLE_DIPLOMACY_PEACE"
  }
 },
 {
  "id": "STANDARD_DIPLOMACY_RANDOM",
  "type": "RANDOM",
  "owner": null,
  "subject": "PLAYER_IS_MAJOR_CIV",
  "args": {
   "DifficultyOffset": "0",
   "ReductionTurns": "10",
   "ReductionValue": "1"
  }
 },
 {
  "id": "STANDARD_DIPLOMACY_RESIDENT_EMBASSY",
  "type": "SIMPLE_MODIFIER",
  "owner": null,
  "subject": "PLAYER_RESIDENT_EMBASSY",
  "args": {
   "InitialValue": "5",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_RESIDENT_EMBASSY"
  }
 },
 {
  "id": "STANDARD_DIPLOMACY_SETTLED_CITIES",
  "type": "SETTLED_CITIES",
  "owner": "ON_TURN_STARTED",
  "subject": "PLAYER_IS_KNOWN_MAJOR_CIV",
  "args": {
   "InitialValue": "0",
   "IncrementValue": "0",
   "ReductionTurns": "10",
   "ReductionValue": "-1",
   "DiplomacyKey": "WARNING_DONT_SETTLE_NEAR_ME",
   "MessageThrottle": "20",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_SETTLED_NEAR_BORDER_WARNING"
  }
 },
 {
  "id": "STANDARD_DIPLOMACY_TRADE_RELATIONS",
  "type": "TRADE_RELATIONS",
  "owner": "ON_TURN_STARTED",
  "subject": "PLAYER_IS_KNOWN_MAJOR_CIV",
  "args": {}
 },
 {
  "id": "STANDARD_DIPLOMATIC_WARMONGER",
  "type": "NEW_WARMONGER",
  "owner": "ON_TURN_STARTED",
  "subject": "PLAYER_IS_NEW_WARMONGER_SUBJECT",
  "args": {
   "ReductionTurns": "2",
   "ReductionValue": "-1",
   "LowerLimit": "-60",
   "PercentOfGrievances": "20"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_3RD_PARTY_DECLARED_SURPRISE_WAR_ON_FRIEND",
  "type": "THIRD_PARTY_EFFECTS",
  "owner": "ON_TURN_STARTED",
  "subject": "PLAYER_IS_KNOWN_MAJOR_CIV",
  "args": {
   "InitialValue": "0",
   "IncrementValue": "0",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DECLARED_SURPRISE_WAR_ON_FRIEND",
   "EffectType": "DeclaredSurpriseWarOnFriend",
   "MaxEffectMagnitude": "8",
   "AmountPerIncident": "-8"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_3RD_PARTY_DENOUNCED_FRIEND",
  "type": "THIRD_PARTY_EFFECTS",
  "owner": "ON_TURN_STARTED",
  "subject": "PLAYER_IS_KNOWN_MAJOR_CIV",
  "args": {
   "InitialValue": "0",
   "IncrementValue": "0",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DENOUNCED_FRIEND",
   "EffectType": "DenoucedFriend",
   "MaxEffectMagnitude": "8",
   "AmountPerIncident": "-6"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_3RD_PARTY_DECLARED_FRIENDSHIP_WITH_FRIEND",
  "type": "THIRD_PARTY_EFFECTS",
  "owner": "ON_TURN_STARTED",
  "subject": "PLAYER_IS_KNOWN_MAJOR_CIV",
  "args": {
   "InitialValue": "0",
   "IncrementValue": "0",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DECLARED_FRIENDSHIP_WITH_FRIEND",
   "EffectType": "DeclaredFriendshipWithFriend",
   "MaxEffectMagnitude": "8",
   "AmountPerIncident": "6"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_3RD_PARTY_ALLIED_WITH_FRIEND",
  "type": "THIRD_PARTY_EFFECTS",
  "owner": "ON_TURN_STARTED",
  "subject": "PLAYER_IS_KNOWN_MAJOR_CIV",
  "args": {
   "InitialValue": "0",
   "IncrementValue": "0",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_ALLIED_WITH_FRIEND",
   "EffectType": "AlliedWithFriend",
   "MaxEffectMagnitude": "8",
   "AmountPerIncident": "8"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_3RD_PARTY_DECLARED_SURPRISE_WAR_ON_ENEMY",
  "type": "THIRD_PARTY_EFFECTS",
  "owner": "ON_TURN_STARTED",
  "subject": "PLAYER_IS_KNOWN_MAJOR_CIV",
  "args": {
   "InitialValue": "0",
   "IncrementValue": "0",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DECLARED_SURPRISE_WAR_ON_ENEMY",
   "EffectType": "DeclaredSurpriseWarOnEnemy",
   "MaxEffectMagnitude": "8",
   "AmountPerIncident": "8"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_3RD_PARTY_DENOUNCED_ENEMY",
  "type": "THIRD_PARTY_EFFECTS",
  "owner": "ON_TURN_STARTED",
  "subject": "PLAYER_IS_KNOWN_MAJOR_CIV",
  "args": {
   "InitialValue": "0",
   "IncrementValue": "0",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DENOUNCED_ENEMY",
   "EffectType": "DenouncedEnemy",
   "MaxEffectMagnitude": "8",
   "AmountPerIncident": "6"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_3RD_PARTY_DECLARED_FRIENDSHIP_WITH_ENEMY",
  "type": "THIRD_PARTY_EFFECTS",
  "owner": "ON_TURN_STARTED",
  "subject": "PLAYER_IS_KNOWN_MAJOR_CIV",
  "args": {
   "InitialValue": "0",
   "IncrementValue": "0",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DECLARED_FRIENDSHIP_WITH_ENEMY",
   "EffectType": "DeclaredFriendshipWithEnemy",
   "MaxEffectMagnitude": "8",
   "AmountPerIncident": "-6"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_3RD_PARTY_ALLIED_WITH_ENEMY",
  "type": "THIRD_PARTY_EFFECTS",
  "owner": "ON_TURN_STARTED",
  "subject": "PLAYER_IS_KNOWN_MAJOR_CIV",
  "args": {
   "InitialValue": "0",
   "IncrementValue": "0",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_ALLIED_WITH_ENEMY",
   "EffectType": "AlliedWithEnemy",
   "MaxEffectMagnitude": "8",
   "AmountPerIncident": "-8"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_BROKEN_PLEDGE",
  "type": "BROKEN_PLEDGE",
  "owner": "ON_TURN_STARTED",
  "subject": "PLAYER_IS_KNOWN_MAJOR_CIV",
  "args": {
   "ModifierPerTransgression": "-6",
   "IncrementValue": "0",
   "ReductionValue": "1",
   "ReductionTurns": "15",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_BROKEN_PLEDGE"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_KEPT_PLEDGE",
  "type": "KEPT_PLEDGE",
  "owner": "ON_TURN_STARTED",
  "subject": "PLAYER_IS_KNOWN_MAJOR_CIV",
  "args": {
   "InitialValue": "0",
   "ModifierPerKeptPledge": "4",
   "IncrementValue": "0",
   "ReductionValue": "1",
   "ReductionTurns": "15",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_KEPT_PLEDGE"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_NO_PLEDGE",
  "type": "NO_PLEDGE",
  "owner": "ON_TURN_STARTED",
  "subject": "PLAYER_IS_KNOWN_MAJOR_CIV",
  "args": {
   "ModifierPerTransgression": "-3",
   "IncrementValue": "0",
   "ReductionValue": "1",
   "ReductionTurns": "10",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_NO_PLEDGE"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_SHARED_EMERGENCY",
  "type": "SIMPLE_MODIFIER",
  "owner": null,
  "subject": "PLAYER_SHARES_EMERGENCY",
  "args": {
   "InitialValue": "4",
   "ReductionTurns": "6",
   "ReductionValue": "-1",
   "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_SHARED_EMERGENCY"
  }
 },
 {
  "id": "STANDARD_DIPLOMATIC_THIRD_PARTY_WARMONGER",
  "type": "THIRD_PARTY_WARMONGER",
  "owner": "ON_TURN_STARTED",
  "subject": "PLAYER_IS_NEW_WARMONGER_SUBJECT",
  "args": {
   "LowerLimit": "-40",
   "PercentOfGrievancesDelta": "10"
  }
 }
];
export const DIPLO_AGENDA_MODIFIERS: Readonly<Record<string, readonly DiploModifierRow[]>> = {
 "AGENDA_AIRPOWER": [
  {
   "id": "AGENDA_HIGH_AIRPOWER",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_HIGH_AIRPOWER",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_HIGH_AIRPOWER",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_HIGH_AIRPOWER",
    "HiddenAgenda": "true"
   }
  },
  {
   "id": "AGENDA_LOW_AIRPOWER",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_LOW_AIRPOWER",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_LOW_AIRPOWER",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_LOW_AIRPOWER",
    "HiddenAgenda": "true"
   }
  }
 ],
 "AGENDA_BARBARIAN_LOVER": [],
 "AGENDA_CITY_STATE_PROTECTOR": [
  {
   "id": "AGENDA_HIGH_PROTECT_CITY_STATES",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_HIGH_CITY_STATE_PROTECTION",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_PROTECTS_CITY_STATES",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_HIGH_CITY_STATE_PROTECTION",
    "HiddenAgenda": "true"
   }
  },
  {
   "id": "AGENDA_MED_PROTECT_CITY_STATES",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_MED_CITY_STATE_PROTECTION",
   "args": {
    "InitialValue": "3",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_MED_CITY_STATE_PROTECTION",
    "HiddenAgenda": "true"
   }
  },
  {
   "id": "AGENDA_MED_ATTACK_CITY_STATES",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_MED_CITY_STATE_AGGRESSION",
   "args": {
    "InitialValue": "-3",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_MED_CITY_STATE_AGGRESSION",
    "HiddenAgenda": "true"
   }
  },
  {
   "id": "AGENDA_HIGH_ATTACK_CITY_STATES",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_HIGH_CITY_STATE_AGGRESSION",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_ATTACKS_CITY_STATES",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_HIGH_CITY_STATE_AGGRESSION",
    "HiddenAgenda": "true"
   }
  }
 ],
 "AGENDA_CIVILIZED": [
  {
   "id": "AGENDA_CLEARS_BARBARIAN_CAMPS",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_CLEARS_BARBARIAN_CAMPS",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_ATTACKS_BARBARIANS",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_ATTACKS_BARBARIANS",
    "HiddenAgenda": "true"
   }
  },
  {
   "id": "AGENDA_IGNORES_BARBARIAN_CAMPS",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_IGNORES_BARBARIAN_CAMPS",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_IGNORES_BARBARIANS",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_IGNORES_BARBARIANS",
    "HiddenAgenda": "true"
   }
  }
 ],
 "AGENDA_CULTURED": [
  {
   "id": "AGENDA_HIGH_CULTURE",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_HIGH_CULTURE",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_HIGH_CULTURE",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_HIGH_CULTURE",
    "HiddenAgenda": "true"
   }
  },
  {
   "id": "AGENDA_LOW_CULTURE",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_LOW_CULTURE",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_LOW_CULTURE",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_LOW_CULTURE",
    "HiddenAgenda": "true"
   }
  }
 ],
 "AGENDA_DARWINIST": [],
 "AGENDA_DEVOUT": [
  {
   "id": "AGENDA_HIGH_FAITH",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_HIGH_FAITH",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_HIGH_FAITH",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_HIGH_FAITH",
    "HiddenAgenda": "true"
   }
  },
  {
   "id": "AGENDA_LOW_FAITH",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_LOW_FAITH",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_LOW_FAITH",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_LOW_FAITH",
    "HiddenAgenda": "true"
   }
  }
 ],
 "AGENDA_ENVIRONMENTALIST": [
  {
   "id": "AGENDA_ENVIRONMENT",
   "type": "AGENDA_KAITIAKITANGA",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_30_TURNS",
   "args": {
    "StatementKey": "AGENDA_KAITIAKITANGA_WARNING",
    "TopPercentage": "60",
    "BottomPercentage": "40",
    "TopRankingDiploMod": "6",
    "BottomRankingDiploMod": "-6",
    "HiddenAgenda": "true"
   }
  }
 ],
 "AGENDA_EXPLOITATIVE": [
  {
   "id": "AGENDA_EXPLOITATION",
   "type": "AGENDA_EXPLOITATIVE",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_30_TURNS",
   "args": {
    "InitialValue": "0",
    "IncrementValue": "0",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_EXPLOITATION",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_EXPLOITATION",
    "HiddenAgenda": "true",
    "TileImprovementHighThreshold": "75",
    "TileImprovementLowThreshold": "35",
    "PlotFeatureRemovalValue": "1",
    "NationalParkConstructionValue": "10",
    "TileImprovementPreferenceValue": "9",
    "MaxDiploModifierMagnitude": "10",
    "HighScoreThreshold": "15",
    "LowScoreThreshold": "-15"
   }
  }
 ],
 "AGENDA_EXPLORER": [
  {
   "id": "AGENDA_HIGH_EXPLORATION",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_HIGH_EXPLORATION",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_HIGH_EXPLORATION",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_HIGH_EXPLORATION",
    "HiddenAgenda": "true"
   }
  },
  {
   "id": "AGENDA_LOW_EXPLORATION",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_LOW_EXPLORATION",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_LOW_EXPLORATION",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_LOW_EXPLORATION",
    "HiddenAgenda": "true"
   }
  }
 ],
 "AGENDA_FUN_LOVING": [
  {
   "id": "AGENDA_HIGH_HAPPINESS",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_HIGH_HAPPINESS",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_HIGH_HAPPINESS",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_HIGH_HAPPINESS",
    "HiddenAgenda": "true"
   }
  },
  {
   "id": "AGENDA_LOW_HAPPINESS",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_LOW_HAPPINESS",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_LOW_HAPPINESS",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_LOW_HAPPINESS",
    "HiddenAgenda": "true"
   }
  }
 ],
 "AGENDA_GREAT_PERSON_ADVOCATE": [
  {
   "id": "AGENDA_MODIFIER_GREAT_PERSON_ADVOCATE_LAG",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_LAGS_GREAT_PEOPLE",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_ AGENDA_GREAT_PERSON_ADVOCATE",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_GREAT_PEOPLE_ADVOCATE_LAGGING",
    "HiddenAgenda": "true"
   }
  },
  {
   "id": "AGENDA_MODIFIER_GREAT_PERSON_ADVOCATE_LEAD",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_LEADS_GREAT_PEOPLE",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_GREAT_PERSON_ADVOCATE",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_GREAT_PEOPLE_ADVOCATE_LEADING",
    "HiddenAgenda": "true"
   }
  }
 ],
 "AGENDA_IDEOLOGUE": [
  {
   "id": "AGENDA_SAME_GOVERNMENT",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "AGENDA_REQUIRE_PLAYER_HAS_SAME_GOVERNMENT",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_SAME_GOVERNMENT",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_SAME_GOVERNMENT",
    "HiddenAgenda": "true"
   }
  },
  {
   "id": "AGENDA_DIFFERENT_GOVERNMENT",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "AGENDA_REQUIRE_PLAYER_HAS_DIFFERENT_GOVERNMENT",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_DIFFERENT_GOVERNMENT",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_DIFFERENT_GOVERNMENT",
    "HiddenAgenda": "true"
   }
  }
 ],
 "AGENDA_INDUSTRIALIST": [
  {
   "id": "AGENDA_HIGH_INDUSTRY",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_HIGH_INDUSTRY",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_HIGH_INDUSTRY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_HIGH_INDUSTRY",
    "HiddenAgenda": "true"
   }
  },
  {
   "id": "AGENDA_LOW_INDUSTRY",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_LOW_INDUSTRY",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_LOW_INDUSTRY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_LOW_INDUSTRY",
    "HiddenAgenda": "true"
   }
  }
 ],
 "AGENDA_MONEY_GRUBBER": [
  {
   "id": "AGENDA_MONEY_GRUBBER",
   "type": "AGENDA_LORD_OF_MINES",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_30_TURNS",
   "args": {
    "StatementKey": "AGENDA_LORD_OF_MINES_WARNING",
    "TopPercentage": "65",
    "BottomPercentage": "30",
    "TopRankingDiploMod": "6",
    "BottomRankingDiploMod": "-6",
    "HiddenAgenda": "true"
   }
  }
 ],
 "AGENDA_NATURALIST": [],
 "AGENDA_NUKE_LOVER": [
  {
   "id": "AGENDA_HIGH_NUKE_LOVE",
   "type": "SIMPLE_MODIFIER",
   "owner": "PLAYER_HAS_NUCLEAR_FISSION_REQUIREMENT",
   "subject": "PLAYER_HAS_HIGH_NUKE_LOVE",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_HIGH_NUKE_LOVE",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_HIGH_NUKE_LOVE",
    "HiddenAgenda": "true"
   }
  },
  {
   "id": "AGENDA_LOW_NUKE_LOVE",
   "type": "SIMPLE_MODIFIER",
   "owner": "PLAYER_HAS_NUCLEAR_FISSION_REQUIREMENT",
   "subject": "PLAYER_HAS_LOW_NUKE_LOVE",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_LOW_NUKE_LOVE",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_LOW_NUKE_LOVE",
    "HiddenAgenda": "true"
   }
  }
 ],
 "AGENDA_PARANOID": [
  {
   "id": "AGENDA_PARANOID",
   "type": "AGENDA_PARANOID",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_30_TURNS",
   "args": {
    "StatementKey": "AGENDA_PARANOID_WARNING",
    "HiddenAgenda": "true"
   }
  }
 ],
 "AGENDA_POPULOUS": [
  {
   "id": "AGENDA_HIGH_POPULATION",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_HIGH_POPULATION",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_HIGH_POPULATION",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_HIGH_POPULATION",
    "HiddenAgenda": "true"
   }
  },
  {
   "id": "AGENDA_LOW_POPULATION",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_LOW_POPULATION",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_LOW_POPULATION",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_LOW_POPULATION",
    "HiddenAgenda": "true"
   }
  }
 ],
 "AGENDA_STANDING_ARMY": [
  {
   "id": "AGENDA_HIGH_STANDING_ARMY",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_HIGH_STANDING_ARMY",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_HIGH_STANDING_ARMY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_HIGH_STANDING_ARMY",
    "HiddenAgenda": "true"
   }
  },
  {
   "id": "AGENDA_LOW_STANDING_ARMY",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_LOW_STANDING_ARMY",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_LOW_STANDING_ARMY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_LOW_STANDING_ARMY",
    "HiddenAgenda": "true"
   }
  }
 ],
 "AGENDA_TECHNOPHILE": [
  {
   "id": "AGENDA_HIGH_SCIENCE",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_HIGH_SCIENCE",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_HIGH_SCIENCE",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_HIGH_SCIENCE",
    "HiddenAgenda": "true"
   }
  },
  {
   "id": "AGENDA_LOW_SCIENCE",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_LOW_SCIENCE",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_LOW_SCIENCE",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_LOW_SCIENCE",
    "HiddenAgenda": "true"
   }
  }
 ],
 "AGENDA_WONDER_ADVOCATE": [
  {
   "id": "AGENDA_MODIFIER_WONDER_ADVOCATE_LAG",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_LAGS_WONDERS",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_WONDER_ADVOCATE",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_WONDER_ADVOCATE_LAGGING",
    "HiddenAgenda": "true"
   }
  },
  {
   "id": "AGENDA_MODIFIER_WONDER_ADVOCATE_LEAD",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_LEADS_WONDERS",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_WONDER_ADVOCATE",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_WONDER_ADVOCATE_LEADING",
    "HiddenAgenda": "true"
   }
  }
 ],
 "AGENDA_ALLY_OF_ENKIDU": [
  {
   "id": "AGENDA_ALLY_OF_ENKIDU_FRIEND",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_DECLARED_FRIEND",
   "args": {
    "InitialValue": "12",
    "ReductionTurns": "10",
    "ReductionValue": "1",
    "MessageThrottle": "20",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_GILGAMESH_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_ALLY_OF_ENKIDU_DECLARED_FRIEND"
   }
  },
  {
   "id": "AGENDA_ALLY_OF_ENKIDU_DENOUNCED_FRIEND",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_FRIEND_DENOUNCED",
   "args": {
    "InitialValue": "-12",
    "ReductionTurns": "10",
    "ReductionValue": "-1",
    "MessageThrottle": "20",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_GILGAMESH_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_ALLY_OF_ENKIDU_DENOUNCED_FRIEND"
   }
  }
 ],
 "AGENDA_AYYUBID_DYNASTY": [],
 "AGENDA_BACKSTAB_AVERSE": [
  {
   "id": "AGENDA_BACKSTAB_AVERSE_FRIEND",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_DECLARED_FRIEND",
   "args": {
    "InitialValue": "1",
    "MaxValue": "12",
    "IncrementValue": "1",
    "IncrementTurns": "10",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_TOMYRIS_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_BACKSTAB_AVERSE_FRIEND"
   }
  },
  {
   "id": "AGENDA_BACKSTAB_AVERSE_SURPRISE_WAR",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_DECLARES_SURPRISE_WAR",
   "args": {
    "InitialValue": "-10",
    "ReductionTurns": "10",
    "ReductionValue": "-1",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_TOMYRIS_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_BACKSTAB_AVERSE_SURPRISE_WAR"
   }
  }
 ],
 "AGENDA_BIG_STICK_POLICY": [
  {
   "id": "AGENDA_CONTINENT_ATTACKED",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_ATTACKED_CONTINENT",
   "args": {
    "InitialValue": "-12",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_T_ROOSEVELT_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_BIG_STICK_CONTINENT_ATTACKED"
   }
  },
  {
   "id": "AGENDA_CONTINENT_PEACEFUL",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_PEACEFUL_ON_CONTINENT",
   "args": {
    "InitialValue": "8",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_T_ROOSEVELT_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_BIG_STICK_CONTINENT_PEACEFUL"
   }
  }
 ],
 "AGENDA_BLACK_QUEEN": [
  {
   "id": "AGENDA_BLACK_QUEEN",
   "type": "AGENDA_BLACK_QUEEN",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_10_TURNS",
   "args": {
    "StatementKey": "AGENDA_BLACK_QUEEN_WARNING"
   }
  }
 ],
 "AGENDA_BUSHIDO": [
  {
   "id": "AGENDA_BUSHIDO",
   "type": "AGENDA_BUSHIDO",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_10_TURNS",
   "args": {
    "StatementKey": "AGENDA_BUSHIDO_WARNING"
   }
  }
 ],
 "AGENDA_CITY_STATE_ALLY": [
  {
   "id": "AGENDA_MODIFIER_NOT_COMPETING_MINORS",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_NOT_COMPETING_MINORS",
   "args": {
    "InitialValue": "12",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_MODIFIER_NOT_COMPETING_MINORS",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_CITY_STATE_NOT_COMPETING",
    "HiddenAgenda": "true"
   }
  },
  {
   "id": "AGENDA_MODIFIER_COMPETING_MINORS",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_COMPETING_MINORS",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_MODIFIER_COMPETING_MINORS",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_CITY_STATE_COMPETING",
    "HiddenAgenda": "true"
   }
  }
 ],
 "AGENDA_COUNTER_REFORMER": [
  {
   "id": "AGENDA_MODIFIER_SAME_RELIGION",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_SAME_RELIGION",
   "args": {
    "InitialValue": "8",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_PHILIP_II_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_COUNTER_REFORMER_SAME"
   }
  },
  {
   "id": "AGENDA_MODIFIER_ENCROACHING_RELIGION",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_ENCROACHING_RELIGION",
   "args": {
    "InitialValue": "-12",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_PHILIP_II_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_COUNTER_REFORMER_ENCROACHING"
   }
  }
 ],
 "AGENDA_DELIAN_LEAGUE": [
  {
   "id": "AGENDA_MODIFIER_DELIAN_NOT_COMPETING_MINORS",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_NOT_COMPETING_MINORS",
   "args": {
    "InitialValue": "12",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_PERICLES_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DELIAN_NOT_COMPETING"
   }
  },
  {
   "id": "AGENDA_MODIFIER_DELIAN_COMPETING_MINORS",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_COMPETING_MINORS",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_PERICLES_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DELIAN_COMPETING"
   }
  }
 ],
 "AGENDA_ENTHUSIASTIC_DISCIPLE": [
  {
   "id": "AGENDA_MODIFIER_RELIGION_RECEIVED",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_RELIGION_RECEIVED",
   "args": {
    "InitialValue": "12",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_MVEMBA_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DISCIPLE_RECEIVED"
   }
  },
  {
   "id": "AGENDA_MODIFIER_RELIGION_NOT_RECEIVED",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_RELIGION_NOT_RECEIVED",
   "args": {
    "InitialValue": "-7",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_MVEMBA_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DISCIPLE_NOT_RECEIVED"
   }
  }
 ],
 "AGENDA_GREAT_PERSON_OBSESSED": [
  {
   "id": "AGENDA_MODIFIER_LAGS_GREAT_PEOPLE",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_LAGS_GREAT_PEOPLE",
   "args": {
    "InitialValue": "8",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_PEDRO_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_GREAT_PEOPLE_OBSESSED_LAGGING"
   }
  },
  {
   "id": "AGENDA_MODIFIER_LEADS_GREAT_PEOPLE",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_LEADS_GREAT_PEOPLE",
   "args": {
    "InitialValue": "-12",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_PEDRO_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_GREAT_PEOPLE_OBSESSED_LEADING"
   }
  }
 ],
 "AGENDA_IRON_CROWN": [
  {
   "id": "AGENDA_MODIFIER_NOT_INVOLVED_MINORS",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_NOT_INVOLVED_MINORS",
   "args": {
    "InitialValue": "12",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_BARBAROSSA_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_IRON_CROWN_NOT_INVOLVED"
   }
  },
  {
   "id": "AGENDA_MODIFIER_CONQUERING_ALLYING_MINORS",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_CONQUERING_ALLYING_MINORS",
   "args": {
    "InitialValue": "-5",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_BARBAROSSA_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_IRON_CROWN_INVOLVED"
   }
  }
 ],
 "AGENDA_LAST_VIKING_KING": [
  {
   "id": "AGENDA_LAST_VIKING_KING",
   "type": "AGENDA_LAST_VIKING_KING",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_10_TURNS",
   "args": {
    "StatementKey": "AGENDA_LAST_VIKING_KING_WARNING"
   }
  }
 ],
 "AGENDA_OPTIMUS_PRINCEPS": [
  {
   "id": "AGENDA_OPTIMUS_PRINCEPS",
   "type": "AGENDA_OPTIMUS_PRINCEPS",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_10_TURNS",
   "args": {
    "StatementKey": "AGENDA_OPTIMUS_PRINCEPS_WARNING"
   }
  }
 ],
 "AGENDA_PEACEKEEPER": [
  {
   "id": "AGENDA_MODIFIER_NOT_WARMONGER",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_NOT_WARMONGER_SUBJECT",
   "args": {
    "InitialValue": "5",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_GANDHI_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_PEACEKEEPER_NOT_WARMONGER"
   }
  },
  {
   "id": "AGENDA_MODIFIER_WARMONGER",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_IS_WARMONGER_SUBJECT",
   "args": {
    "InitialValue": "-8",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_GANDHI_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_PEACEKEEPER_WARMONGER"
   }
  }
 ],
 "AGENDA_QUEEN_OF_NILE": [
  {
   "id": "AGENDA_QUEEN_OF_NILE",
   "type": "AGENDA_QUEEN_OF_NILE",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_10_TURNS",
   "args": {
    "StatementKey": "AGENDA_QUEEN_OF_NILE_WARNING"
   }
  }
 ],
 "AGENDA_SUN_NEVER_SETS": [
  {
   "id": "AGENDA_SUN_SETS_HOME_CONTINENT",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_SAME_HOME_CONTINENT",
   "args": {
    "InitialValue": "12",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_VICTORIA_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_SUN_SETS_HOME_CONTINENT"
   }
  },
  {
   "id": "AGENDA_SUN_SETS_NEW_CONTINENT",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_ON_NEW_CONTINENT",
   "args": {
    "InitialValue": "-5",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_VICTORIA_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_SUN_SETS_NEW_CONTINENT"
   }
  }
 ],
 "AGENDA_TLATOANI": [
  {
   "id": "AGENDA_HAS_DESIRED_LUXURY",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_DESIRED_LUXURY",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_MONTEZUMA_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_TLATOANI_HAS_DESIRED_LUXURY"
   }
  },
  {
   "id": "AGENDA_HAS_NO_DESIRED_LUXURY",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_NO_DESIRED_LUXURY",
   "args": {
    "InitialValue": "12",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_MONTEZUMA_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_TLATOANI_HAS_NO_DESIRED_LUXURY"
   }
  }
 ],
 "AGENDA_WESTERNIZER": [
  {
   "id": "AGENDA_MODIFIER_LAGS_PROGRESS",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_LAGS_PROGRESS",
   "args": {
    "InitialValue": "-7",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_PETER_GREAT_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_WESTERNIZER_LAGGING"
   }
  },
  {
   "id": "AGENDA_MODIFIER_LEADS_PROGRESS",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_LEADS_PROGRESS",
   "args": {
    "InitialValue": "7",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_PETER_GREAT_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_WESTERNIZER_LEADING"
   }
  }
 ],
 "AGENDA_WITH_YOUR_SHIELD_OR_ON_IT": [
  {
   "id": "AGENDA_MODIFIER_WITH_SHIELD_OR_ON_IT",
   "type": "AGENDA_WITH_SHIELD_OR_ON_IT",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_WITH_SHIELD_OR_ON_IT",
   "args": {
    "InitialValue": "0",
    "IncrementValue": "0",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_GORGO_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_WITH_SHIELD_OR_ON_IT",
    "MaxDiploModifierMagnitude": "12",
    "HighThreshold": "4",
    "LowThreshold": "-1",
    "AvoidedWarPenalty": "-4",
    "AvoidedWarPenaltyTurnsToRampUp": "15",
    "PaidForPeacePenalty": "-8",
    "PaidForPeacePenaltyTurnsToFadeOut": "30",
    "ReductionValue": "0",
    "ReductionTurns": "2"
   }
  }
 ],
 "AGENDA_WONDER_OBSESSED": [
  {
   "id": "AGENDA_MODIFIER_LAGS_WONDERS",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_LAGS_WONDERS",
   "args": {
    "InitialValue": "8",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_QIN_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_WONDER_OBSESSED_LAGGING"
   }
  },
  {
   "id": "AGENDA_MODIFIER_LEADS_WONDERS",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_LEADS_WONDERS",
   "args": {
    "InitialValue": "-12",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_QIN_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_WONDER_OBSESSED_LEADING"
   }
  }
 ],
 "AGENDA_BILLIONAIRE": [
  {
   "id": "AGENDA_BILLIONAIRE_TRADE",
   "type": "TRADE_RELATIONS",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_30_TURNS",
   "args": {
    "TradeBonus": "3",
    "NoTradePenalty": "12",
    "BonusPerRoute": "true",
    "OnlyInboundTrade": "true",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_WILHELMINA_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_WILHELMINA_BILLIONAIRE_TRADE"
   }
  }
 ],
 "AGENDA_CHEOMSEONGDAE": [
  {
   "id": "AGENDA_CHEOMSEONGDAE_HIGH_SCIENCE",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_HIGH_SCIENCE",
   "args": {
    "InitialValue": "8",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_SEONDEOK_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_CHEOMSEONGDAE_HIGH_SCIENCE"
   }
  },
  {
   "id": "AGENDA_CHEOMSEONGDAE_LOW_SCIENCE",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_LOW_SCIENCE",
   "args": {
    "InitialValue": "-8",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_SEONDEOK_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_CHEOMSEONGDAE_LOW_SCIENCE"
   }
  }
 ],
 "AGENDA_FLOWER_OF_SCOTLAND": [
  {
   "id": "AGENDA_FLOWER_OF_SCOTLAND_WAR_NEIGHBORS",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_AT_WAR_WITH_NEIGHBORS",
   "args": {
    "InitialValue": "-2",
    "MaxValue": "-10",
    "IncrementTurns": "3",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ROBERT_THE_BRUCE_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_FLOWER_SCOTLAND_WARLIKE"
   }
  },
  {
   "id": "AGENDA_FLOWER_OF_SCOTLAND_PEACE_NEIGHBORS",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_NOT_AT_WAR_WITH_NEIGHBORS",
   "args": {
    "InitialValue": "2",
    "MaxValue": "10",
    "IncrementTurns": "10",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ROBERT_THE_BRUCE_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_FLOWER_SCOTLAND_PEACEFUL"
   }
  }
 ],
 "AGENDA_HORSE_LORD": [
  {
   "id": "AGENDA_HORSE_LORD",
   "type": "AGENDA_HORSE_LORD",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_10_TURNS",
   "args": {
    "StatementKey": "AGENDA_HORSE_LORD_WARNING",
    "TopPercentage": "70",
    "BottomPercentage": "30",
    "TopRankingDiploMod": "-6",
    "BottomRankingDiploMod": "7",
    "PromotionClass1": "PROMOTION_CLASS_HEAVY_CAVALRY",
    "PromotionClass2": "PROMOTION_CLASS_LIGHT_CAVALRY"
   }
  }
 ],
 "AGENDA_HORN_CHEST_LOINS": [
  {
   "id": "AGENDA_HORN_CHEST_LOINS",
   "type": "AGENDA_HORN_CHEST_LOINS",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_10_TURNS",
   "args": {
    "StatementKey": "AGENDA_HORN_CHEST_LOINS_WARNING",
    "TopPercentage": "70",
    "BottomPercentage": "30",
    "TopRankingDiploMod": "6",
    "BottomRankingDiploMod": "-7",
    "CantBuildDiploMod": "-3",
    "CorpsPrereqCivic": "CIVIC_NATIONALISM"
   }
  }
 ],
 "AGENDA_IRON_CONFEDERACY": [
  {
   "id": "AGENDA_IRON_CONFEDERACY_MANY_ALLIANCES",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_MANY_ALLIANCES",
   "args": {
    "InitialValue": "8",
    "MaxValue": "8",
    "ReductionTurns": "4",
    "ReductionValue": "-8",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ROBERT_THE_BRUCE_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_IRON_CONFEDERACY_MANY_ALLIANCES"
   }
  },
  {
   "id": "AGENDA_IRON_CONFEDERACY_FEW_ALLIANCES",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_FEW_ALLIANCES",
   "args": {
    "InitialValue": "-8",
    "MaxValue": "-8",
    "IncrementTurns": "4",
    "IncrementValue": "-8",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ROBERT_THE_BRUCE_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_IRON_CONFEDERACY_FEW_ALLIANCES"
   }
  }
 ],
 "AGENDA_MAURYA_EMPIRE": [
  {
   "id": "AGENDA_MAURYA_EMPIRE_NEIGHBORS",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYERS_ARE_NEIGHBORS",
   "args": {
    "InitialValue": "-5",
    "MaxValue": "-25",
    "IncrementValue": "-1",
    "IncrementTurns": "10",
    "StatementKey": "LOC_DIPLO_WARNING_EXIT_LEADER_CHANDRAGUPTA_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_CHANDRAGUPTA_NEIGHBOR"
   }
  },
  {
   "id": "AGENDA_MAURYA_EMPIRE_NOT_NEIGHBORS",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYERS_ARE_NOT_NEIGHBORS",
   "args": {
    "InitialValue": "5",
    "MaxValue": "15",
    "IncrementValue": "1",
    "IncrementTurns": "5",
    "StatementKey": "LOC_DIPLO_KUDO_EXIT_LEADER_CHANDRAGUPTA_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_CHANDRAGUPTA_NOT_NEIGHBOR"
   }
  }
 ],
 "AGENDA_NARIKALA_FORTRESS": [
  {
   "id": "AGENDA_NARIKALA_FORTRESS_HIGH_WALLS",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_HIGH_WALLS",
   "args": {
    "InitialValue": "8",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_TAMAR_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_NARIKALA_FORTRESS_HIGH_WALLS"
   }
  },
  {
   "id": "AGENDA_NARIKALA_FORTRESS_LOW_WALLS",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_LOW_WALLS",
   "args": {
    "InitialValue": "-8",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_TAMAR_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_NARIKALA_FORTRESS_LOW_WALLS"
   }
  }
 ],
 "AGENDA_SPIRIT_OF_TUCAPEL": [
  {
   "id": "AGENDA_SPIRIT_OF_TUCAPEL_GAINING_CITIES",
   "type": "AGENDA_SPIRIT_OF_TUCAPEL",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_10_TURNS",
   "args": {
    "CityGainUpperBound": "3",
    "CityGainLowerBound": "0",
    "ScorePerCity": "3",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_LAUTARO_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_SPIRIT_OF_TUCAPEL_GAINING_CITIES"
   }
  },
  {
   "id": "AGENDA_SPIRIT_OF_TUCAPEL_LOSING_CITIES",
   "type": "AGENDA_SPIRIT_OF_TUCAPEL",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_10_TURNS",
   "args": {
    "CityGainUpperBound": "0",
    "CityGainLowerBound": "-3",
    "ScorePerCity": "3",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_LAUTARO_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_SPIRIT_OF_TUCAPEL_LOSING_CITIES"
   }
  }
 ],
 "AGENDA_CURMUDGEON": [],
 "AGENDA_FLIRTATIOUS": [],
 "AGENDA_GOSSIP": [
  {
   "id": "AGENDA_GOSSIP_POSITIVE",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_IS_SHARING_INFO",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_GOSSIP_POSITIVE",
    "HiddenAgenda": "true",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_GOSSIP_POSITIVE"
   }
  },
  {
   "id": "AGENDA_GOSSIP_NEGATIVE",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_IS_NOT_SHARING_INFO",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_GOSSIP_NEGATIVE",
    "HiddenAgenda": "true",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_GOSSIP_NEGATIVE"
   }
  }
 ],
 "AGENDA_SYCOPHANT": [
  {
   "id": "AGENDA_SYCOPHANT_GOLDEN_AGE",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_GOLDEN_AGE_HAVE_MET",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_SYCOPHANT_GOLDEN_AGE",
    "HiddenAgenda": "true",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_SYCOPHANT_GOLDEN_AGE"
   }
  },
  {
   "id": "AGENDA_SYCOPHANT_DARK_AGE",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_DARK_AGE_HAVE_MET",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_SYCOPHANT_DARK_AGE",
    "HiddenAgenda": "true",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_SYCOPHANT_DARK_AGE"
   }
  }
 ],
 "AGENDA_SYMPATHIZER": [
  {
   "id": "AGENDA_SYMPATHIZER_GOLDEN_AGE",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_GOLDEN_AGE_HAVE_MET",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_SYMPATHIZER_GOLDEN_AGE",
    "HiddenAgenda": "true",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_SYMPATHIZER_GOLDEN_AGE"
   }
  },
  {
   "id": "AGENDA_SYMPATHIZER_DARK_AGE",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_DARK_AGE_HAVE_MET",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_SYMPATHIZER_DARK_AGE",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_SYMPATHIZER_DARK_AGE",
    "HiddenAgenda": "true"
   }
  }
 ],
 "AGENDA_DEMAGOGUE": [
  {
   "id": "AGENDA_HIGH_FAVOR",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_HIGH_FAVOR",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_HIGH_FAVOR",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_HIGH_FAVOR",
    "HiddenAgenda": "true"
   }
  },
  {
   "id": "AGENDA_LOW_FAVOR",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_LOW_FAVOR",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_LOW_FAVOR",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_LOW_FAVOR",
    "HiddenAgenda": "true"
   }
  }
 ],
 "AGENDA_DESTINATION_CIV": [
  {
   "id": "AGENDA_HIGH_TOURISM",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_HIGH_TOURISM",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_HIGH_TOURISM",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_HIGH_TOURISM",
    "HiddenAgenda": "true"
   }
  },
  {
   "id": "AGENDA_LOW_TOURISM",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_LOW_TOURISM",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_LOW_TOURISM",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_LOW_TOURISM",
    "HiddenAgenda": "true"
   }
  }
 ],
 "AGENDA_EXPANSIONIST": [
  {
   "id": "AGENDA_EXPANSIONIST",
   "type": "AGENDA_OPTIMUS_PRINCEPS",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_30_TURNS",
   "args": {
    "StatementKey": "AGENDA_EXPANSIONIST_WARNING",
    "TopTerritoryBonus": "6",
    "BetterTerritoryBonus": "4",
    "HiddenAgenda": "true",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_EXPANSIONIST"
   }
  }
 ],
 "AGENDA_FLAT_EARTHER": [
  {
   "id": "AGENDA_FLAT_EARTHER",
   "type": "AGENDA_FLAT_EARTHER",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_30_TURNS",
   "args": {
    "StatementKey": "AGENDA_FLAT_EARTHER_WARNING",
    "TopRankingDiploMod": "8",
    "DiploModForCircumnavigation": "-2",
    "DiploModPerSpaceport": "-1",
    "DiploModPerSpaceProject": "-1",
    "HiddenAgenda": "true",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_FLAT_EARTHER"
   }
  }
 ],
 "AGENDA_GREAT_WHITE_FLEET": [
  {
   "id": "AGENDA_GREAT_WHITE_FLEET",
   "type": "AGENDA_LAST_VIKING_KING",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_30_TURNS",
   "args": {
    "StatementKey": "AGENDA_GREAT_WHITE_FLEET_WARNING",
    "TopMilitaryBonus": "6",
    "BetterMilitaryBonus": "4",
    "HiddenAgenda": "true",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_GREAT_WHITE_FLEET"
   }
  }
 ],
 "AGENDA_INTOLERANT": [
  {
   "id": "AGENDA_INTOLERANT_SAME_RELIGION",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_SAME_RELIGION",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_INTOLERANT_SAME_RELIGION",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_INTOLERANT_SAME",
    "HiddenAgenda": "true"
   }
  },
  {
   "id": "AGENDA_INTOLERANT_ENCROACHING_RELIGION",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_ENCROACHING_RELIGION",
   "args": {
    "InitialValue": "-8",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_INTOLERANT_ENCROACHING_RELIGION",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_INTOLERANT_ENCROACHING",
    "HiddenAgenda": "true"
   }
  }
 ],
 "AGENDA_LIBERTARIAN": [
  {
   "id": "AGENDA_HIGH_DIPLOVP",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_HIGH_DIPLOVP",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_HIGH_DIPLOVP",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_HIGH_DIPLOVP",
    "HiddenAgenda": "true"
   }
  },
  {
   "id": "AGENDA_LOW_DIPLOVP",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_LOW_DIPLOVP",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_LOW_DIPLOVP",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_LOW_DIPLOVP",
    "HiddenAgenda": "true"
   }
  }
 ],
 "AGENDA_PILLAGER": [
  {
   "id": "AGENDA_HIGH_PILLAGE",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_HIGH_PILLAGE",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_HIGH_PILLAGE",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_HIGH_PILLAGE",
    "HiddenAgenda": "true"
   }
  },
  {
   "id": "AGENDA_LOW_PILLAGE",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_LOW_PILLAGE",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_LOW_PILLAGE",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_LOW_PILLAGE",
    "HiddenAgenda": "true"
   }
  }
 ],
 "AGENDA_TURTLER": [
  {
   "id": "AGENDA_TURTLER",
   "type": "AGENDA_TURTLER",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_30_TURNS",
   "args": {
    "SimpleModifierDescription": "AGENDA_TURTLER_WARNING",
    "TopRankingDiploMod": "4",
    "BottomRankingDiploMod": "-6",
    "HiddenAgenda": "true"
   }
  }
 ],
 "AGENDA_ZEALOT": [
  {
   "id": "AGENDA_ZEALOT",
   "type": "AGENDA_ZEALOT",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_30_TURNS",
   "args": {
    "StatementKey": "AGENDA_ZEALOT_WARNING",
    "TopRankingDiploMod": "6",
    "BottomRankingDiploMod": "-6",
    "HiddenAgenda": "true"
   }
  }
 ],
 "AGENDA_ANGEVIN_EMPIRE": [
  {
   "id": "AGENDA_ANGEVIN_EMPIRE",
   "type": "AGENDA_ANGEVIN_EMPIRE",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_10_TURNS",
   "args": {
    "StatementKey": "AGENDA_ANGEVIN_EMPIRE_WARNING",
    "HighPopulationThreshold": "110",
    "LowPopulationThreshold": "70",
    "TopRankingDiploMod": "8",
    "BottomRankingDiploMod": "-8"
   }
  }
 ],
 "AGENDA_CANADIAN_EXPEDITIONARY": [
  {
   "id": "AGENDA_CANADIAN_EXPEDITIONARY",
   "type": "AGENDA_CANADIAN_EXPEDITIONARY",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_10_TURNS",
   "args": {
    "StatementKey": "AGENDA_CANADIAN_EXPEDITIONARY_WARNING",
    "TopPercentage": "65",
    "BottomPercentage": "30",
    "TopRankingDiploMod": "8",
    "BottomRankingDiploMod": "-8"
   }
  }
 ],
 "AGENDA_KAITIAKITANGA": [
  {
   "id": "AGENDA_KAITIAKITANGA",
   "type": "AGENDA_KAITIAKITANGA",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_10_TURNS",
   "args": {
    "StatementKey": "AGENDA_KAITIAKITANGA_WARNING",
    "TopPercentage": "60",
    "BottomPercentage": "40",
    "TopRankingDiploMod": "8",
    "BottomRankingDiploMod": "-8"
   }
  }
 ],
 "AGENDA_LAWGIVER": [
  {
   "id": "AGENDA_LAWGIVER",
   "type": "AGENDA_LAWGIVER",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_10_TURNS",
   "args": {
    "StatementKey": "AGENDA_LAWGIVER_WARNING",
    "TopPercentage": "65",
    "BottomPercentage": "30",
    "TopRankingDiploMod": "8",
    "BottomRankingDiploMod": "-8",
    "BonusIfNotOriginalOwner": "50"
   }
  }
 ],
 "AGENDA_LORD_OF_MINES": [
  {
   "id": "AGENDA_LORD_OF_MINES",
   "type": "AGENDA_LORD_OF_MINES",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_10_TURNS",
   "args": {
    "StatementKey": "AGENDA_LORD_OF_MINES_WARNING",
    "TopPercentage": "65",
    "BottomPercentage": "30",
    "TopRankingDiploMod": "8",
    "BottomRankingDiploMod": "-8"
   }
  }
 ],
 "AGENDA_RAVEN_BANNER": [
  {
   "id": "AGENDA_RAVEN_BANNER",
   "type": "AGENDA_RAVEN_BANNER",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_10_TURNS",
   "args": {
    "StatementKey": "AGENDA_RAVEN_BANNER_WARNING",
    "TopPercentage": "65",
    "BottomPercentage": "30",
    "TopRankingDiploMod": "8",
    "BottomRankingDiploMod": "-8"
   }
  }
 ],
 "AGENDA_PATRON_OF_ARTS": [
  {
   "id": "AGENDA_PATRON_OF_ARTS",
   "type": "AGENDA_PATRON_OF_ARTS",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_10_TURNS",
   "args": {
    "StatementKey": "AGENDA_PATRON_OF_ARTS_WARNING",
    "TopPercentage": "65",
    "BottomPercentage": "30",
    "TopRankingDiploMod": "-8",
    "BottomRankingDiploMod": "8"
   }
  }
 ],
 "AGENDA_SAPA_INCA": [
  {
   "id": "AGENDA_SAPA_INCA_LOW_MOUNTAIN_CITIES",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_LOW_MOUNTAIN_CITIES",
   "args": {
    "InitialValue": "8",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_PACHACUTI_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_SAPA_INCA_LOW_MOUNTAIN_CITIES"
   }
  },
  {
   "id": "AGENDA_SAPA_INCA_HIGH_MOUNTAIN_CITIES",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_HIGH_MOUNTAIN_CITIES",
   "args": {
    "InitialValue": "-8",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_PACHACUTI_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_SAPA_INCA_HIGH_MOUNTAIN_CITIES"
   }
  }
 ],
 "AGENDA_SICILIAN_WARS": [
  {
   "id": "AGENDA_SICILIAN_WARS_LOW_COASTAL_CITES",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_LOW_COASTAL_CITIES",
   "args": {
    "InitialValue": "8",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_DIDO_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_SICILIAN_WARS_LOW_COASTAL_CITES"
   }
  },
  {
   "id": "AGENDA_SICILIAN_WARS_HIGH_COASTAL_CITIES",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_HIGH_COASTAL_CITIES",
   "args": {
    "InitialValue": "-8",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_DIDO_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_SICILIAN_WARS_HIGH_COASTAL_CITIES"
   }
  }
 ],
 "AGENDA_PERPETUALLY_ON_GUARD": [
  {
   "id": "AGENDA_PERPETUALLY_ON_GUARD_LIBERATION",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_CITY_LIBERATED",
   "args": {
    "InitialValue": "15",
    "ReductionTurns": "10",
    "ReductionValue": "-1",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_JOHN_CURTIN_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_ON_GUARD_LIBERATE"
   }
  },
  {
   "id": "AGENDA_PERPETUALLY_ON_GUARD_OCCUPATION",
   "type": "AGENDA_PERPETUALLY_ON_GUARD",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_10_TURNS",
   "args": {
    "PenaltyPerOccupiedCity": "-2",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_JOHN_CURTIN_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_ON_GUARD_OCCUPY"
   }
  }
 ],
 "AGENDA_HAMMURABI_DISTRICTS": [
  {
   "id": "AGENDA_HAMMURABI_DISTRICTS",
   "type": "AGENDA_HAMMURABI_DISTRICTS",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_30_TURNS",
   "args": {
    "StatementKey": "AGENDA_HAMMURABI_DISTRICTS",
    "SimpleModifierDescription": "LOC_TOOLTIP_SAMPLE_DIPLOMACY_HAMMURABI_DISTRICT"
   }
  }
 ],
 "AGENDA_BASIL_ZEALOT": [
  {
   "id": "AGENDA_BASIL_ZEALOT",
   "type": "AGENDA_ZEALOT",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_30_TURNS",
   "args": {
    "StatementKey": "AGENDA_ZEALOT_WARNING",
    "TopRankingDiploMod": "6",
    "BottomRankingDiploMod": "-6"
   }
  }
 ],
 "AGENDA_AMBIORIX_ARMY": [
  {
   "id": "AGENDA_AMBIORIX_ARMY",
   "type": "AGENDA_AMBIORIX_ARMY",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV",
   "args": {
    "StatementKey": "AGENDA_AMBIORIX",
    "MinUnitsNeeded": "5",
    "DeltaUnits": "5",
    "MaxSteps": "4",
    "AdjustPerStep": "4"
   }
  }
 ],
 "AGENDA_MAGNIFICENCES": [
  {
   "id": "AGENDA_MAGNIFICENCES",
   "type": "AGENDA_MAGNIFICENCES",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_10_TURNS",
   "args": {
    "StatementKey": "LOC_PLACEHOLDER"
   }
  }
 ],
 "AGENDA_ETHIOPIAN_HIGHLANDS": [
  {
   "id": "AGENDA_MODIFIER_CITIES_NEAR_HILLS",
   "type": "AGENDA_ETHIOPIAN_HIGHLANDS",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV",
   "args": {
    "StatementKey": "LOC_PLACEHOLDER"
   }
  }
 ],
 "AGENDA_LADY_SIX_SKY": [
  {
   "id": "AGENDA_MODIFIER_LADY_SIX_SKY_NEIGHBORS",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYERS_ARE_NEIGHBORS",
   "args": {
    "InitialValue": "-8",
    "StatementKey": "LOC_DIPLO_WARNING_EXIT_LEADER_LADY_SIX_SKY_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_LADY_SIX_SKY_NEIGHBOR"
   }
  },
  {
   "id": "AGENDA_MODIFIER_LADY_SIX_SKY_NOT_NEIGHBORS",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYERS_ARE_NOT_NEIGHBORS",
   "args": {
    "InitialValue": "8",
    "StatementKey": "LOC_DIPLO_KUDO_EXIT_LEADER_LADY_SIX_SKY_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_LADY_SIX_SKY_NOT_NEIGHBOR"
   }
  }
 ],
 "AGENDA_SIMON_BOLIVAR": [
  {
   "id": "AGENDA_MODIFIER_SIMON_BOLIVAR",
   "type": "AGENDA_SIMON_BOLIVAR",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_10_TURNS",
   "args": {
    "MinPromotedUnits": "5",
    "PercentageDifferencePerStep": "10",
    "NumSteps": "4",
    "ScorePerStep": "3",
    "StatementKey": "LOC_DIPLO_KUDO_EXIT_LEADER_SIMON_BOLIVAR_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_AGENDA_SIMON_BOLIVAR"
   }
  }
 ],
 "AGENDA_ETERNAL": [
  {
   "id": "AGENDA_HIGH_DISTRICTS_LUDWIG",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_LEADS_DISTRICTS_LUDWIG",
   "args": {
    "InitialValue": "-8",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_LUDWIG_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_ETERNAL_LEADING"
   }
  },
  {
   "id": "AGENDA_LOW_DISTRICTS_LUDWIG",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_LAGS_DISTRICTS_LUDWIG",
   "args": {
    "InitialValue": "8",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_LUDWIG_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_ETERNAL_LAGGING"
   }
  }
 ],
 "AGENDA_NEW_ROME": [
  {
   "id": "AGENDA_HIGH_CULTURE_NEW_ROME",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_HIGH_CULTURE",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_THEODORA",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_HIGH_CULTURE"
   }
  },
  {
   "id": "AGENDA_LOW_CULTURE_NEW_ROME",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_LOW_CULTURE",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_THEODORA",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_LOW_CULTURE"
   }
  }
 ],
 "AGENDA_SEJONG": [
  {
   "id": "AGENDA_MODIFIER_LAGS_PROGRESS_SEJONG",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_LAGS_PROGRESS",
   "args": {
    "InitialValue": "7",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_SEJONG_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_SEJONG_LAGGING"
   }
  },
  {
   "id": "AGENDA_MODIFIER_LEADS_PROGRESS_SEJONG",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_LEADS_PROGRESS",
   "args": {
    "InitialValue": "-7",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_SEJONG_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_SEJONG_LEADING"
   }
  }
 ],
 "AGENDA_PRESERVER_OF_THE_UNION": [
  {
   "id": "AGENDA_SAME_GOVERNMENT_LINCOLN",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "AGENDA_REQUIRE_PLAYER_HAS_SAME_GOVERNMENT",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_SAME_GOVERNMENT",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_SAME_GOVERNMENT"
   }
  },
  {
   "id": "AGENDA_DIFFERENT_GOVERNMENT_LINCOLN",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "AGENDA_REQUIRE_PLAYER_HAS_DIFFERENT_GOVERNMENT",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_DIFFERENT_GOVERNMENT",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_DIFFERENT_GOVERNMENT"
   }
  }
 ],
 "AGENDA_SULTAN": [
  {
   "id": "AGENDA_SULTAN_RELIGION_RECEIVED",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_RELIGION_RECEIVED",
   "args": {
    "InitialValue": "-12",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_SALADIN_ALT_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_SULTAN_RECEIVED"
   }
  },
  {
   "id": "AGENDA_SULTAN_RELIGION_NOT_RECEIVED",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_RELIGION_NOT_RECEIVED",
   "args": {
    "InitialValue": "7",
    "StatementKey": "LOC_DIPLO_KUDOS_LEADER_SALADIN_ALT_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_SULTAN_NOT_RECEIVED"
   }
  }
 ],
 "AGENDA_DECOLONIZATION": [
  {
   "id": "AGENDA_DECOLONIZATION_HOME_CONTINENT",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_SAME_HOME_CONTINENT",
   "args": {
    "InitialValue": "-12",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_VICTORIA_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DECOLONIZATION_HOME_CONTINENT"
   }
  },
  {
   "id": "AGENDA_DECOLONIZATION_NEW_CONTINENT",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_ON_NEW_CONTINENT",
   "args": {
    "InitialValue": "5",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_VICTORIA_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DECOLONIZATION_NEW_CONTINENT"
   }
  }
 ],
 "AGENDA_SAKOKU": [
  {
   "id": "AGENDA_SAKOKU_TURTLER",
   "type": "AGENDA_SAKOKU_TURTLER",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_30_TURNS",
   "args": {
    "StatementKey": "AGENDA_TURTLER_WARNING",
    "TopRankingDiploMod": "4",
    "BottomRankingDiploMod": "-6"
   }
  }
 ],
 "AGENDA_PREFER_LANDPOWER": [
  {
   "id": "AGENDA_HIGH_LANDPOWER",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_HIGH_STANDING_ARMY",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_NADER_SHAH_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_LANDPOWER_LEADING"
   }
  },
  {
   "id": "AGENDA_LOW_LANDPOWER",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_LOW_STANDING_ARMY",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_NADER_SHAH_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_LANDPOWER_LAGGING"
   }
  }
 ],
 "AGENDA_GOLDEN_AGE": [
  {
   "id": "AGENDA_SYCOPHANT_GOLDEN_AGE",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_GOLDEN_AGE_HAVE_MET",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_SYCOPHANT_GOLDEN_AGE",
    "HiddenAgenda": "true",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_SYCOPHANT_GOLDEN_AGE"
   }
  },
  {
   "id": "AGENDA_SYCOPHANT_DARK_AGE",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_DARK_AGE_HAVE_MET",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_SYCOPHANT_DARK_AGE",
    "HiddenAgenda": "true",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_SYCOPHANT_DARK_AGE"
   }
  }
 ],
 "AGENDA_ARCHIPELAGIC_STATE": [
  {
   "id": "AGENDA_ARCHIPELAGIC_STATE",
   "type": "AGENDA_ARCHIPELAGIC_STATE",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_10_TURNS",
   "args": {
    "AcceptableIslandPercentage": "20",
    "MaxTilesSmallIsland": "7",
    "MaxTilesMediumIsland": "19",
    "MaxTilesLargeIsland": "37",
    "MaxPositiveModifier": "8",
    "MaxNegativeModifier": "-8",
    "ReductionTurns": "2",
    "StatementKey": "AGENDA_ARCHIPELAGIC_STATE_WARNING"
   }
  }
 ],
 "AGENDA_END_TO_SUFFERING": [
  {
   "id": "AGENDA_END_TO_SUFFERING",
   "type": "AGENDA_END_TO_SUFFERING",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_10_TURNS",
   "args": {
    "TargetHolySitePercentage": "50",
    "DisappointingHolySitePercentage": "25",
    "TargetLargeCityPercentage": "65",
    "DisappointingLargeCityPercentage": "35",
    "MaxPositiveModifier": "8",
    "MaxNegativeModifier": "-8",
    "StatementKey": "AGENDA_END_TO_SUFFERING_WARNING"
   }
  }
 ],
 "AGENDA_GALLIC_WARS": [
  {
   "id": "AGENDA_CLEARS_BARBARIAN_CAMPS_CAESAR",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_CLEARS_BARBARIAN_CAMPS",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_ATTACKS_BARBARIANS",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_ATTACKS_BARBARIANS"
   }
  },
  {
   "id": "AGENDA_IGNORES_BARBARIAN_CAMPS_CAESAR",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_IGNORES_BARBARIAN_CAMPS",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_IGNORES_BARBARIANS",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_IGNORES_BARBARIANS"
   }
  }
 ],
 "AGENDA_TRIEU_DEFENDER": [
  {
   "id": "AGENDA_TRIEU_DEFENDER",
   "type": "AGENDA_TRIEU_DEFENDER",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_10_TURNS",
   "args": {}
  }
 ],
 "AGENDA_KUBLAI_PAX": [
  {
   "id": "AGENDA_KUBLAI_PAX",
   "type": "AGENDA_KUBLAI_PAX",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_30_TURNS",
   "args": {
    "StatementKey": "AGENDA_KUBLAI_PAX_KUDO_AND_WARNING"
   }
  }
 ],
 "AGENDA_SHORT_LIFE_GLORY": [
  {
   "id": "AGENDA_SHORT_LIFE_GLORY",
   "type": "AGENDA_SHORT_LIFE_GLORY",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_10_TURNS",
   "args": {
    "MajorWarBonus": "5",
    "EachWarDeclaredBonus": "1",
    "MaxWarDeclaredBonus": "5",
    "NotAtWarPenalty": "-6",
    "SinceWarPenaltyTurns": "40",
    "StatementKey": "AGENDA_SHORT_LIFE_GLORY"
   }
  }
 ],
 "AGENDA_BACKSTABBER": [
  {
   "id": "AGENDA_BACKSTABBER",
   "type": "AGENDA_OPPORTUNIST",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_10_TURNS",
   "args": {
    "RecentSurpriseWarBonus": "15",
    "SurpriseWarDegradeTurns": "3",
    "EachSurpriseWarBonus": "1",
    "NeverSurpriseWarPenalty": "-6",
    "StatementKey": "AGENDA_BACKSTABBER"
   }
  }
 ],
 "AGENDA_CITY_PLANNER": [
  {
   "id": "AGENDA_HIGH_DISTRICTS",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_LEADS_DISTRICTS",
   "args": {
    "InitialValue": "8",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_AMANITORE_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_CITY_PLANNER_LEADING"
   }
  },
  {
   "id": "AGENDA_LOW_DISTRICTS",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_LAGS_DISTRICTS",
   "args": {
    "InitialValue": "-8",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_AMANITORE_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_CITY_PLANNER_LAGGING"
   }
  }
 ],
 "AGENDA_SAINT": [
  {
   "id": "AGENDA_SAINT_HIGH_FAITH",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_HIGH_FAITH",
   "args": {
    "InitialValue": "8",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_JADWIGA_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_SAINT_HIGH_FAITH"
   }
  },
  {
   "id": "AGENDA_SAINT_LOW_FAITH",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_LOW_FAITH",
   "args": {
    "InitialValue": "-8",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_JADWIGA_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_SAINT_LOW_FAITH"
   }
  }
 ],
 "AGENDA_JOAO_EXPLORER": [
  {
   "id": "AGENDA_JOAO_HIGH_EXPLORATION",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_HIGH_EXPLORATION",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_JOAO_AGENDA_HIGH_EXPLORATION"
   }
  },
  {
   "id": "AGENDA_JOAO_LOW_EXPLORATION",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_LOW_EXPLORATION",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_JOAO_AGENDA_LOW_EXPLORATION"
   }
  }
 ],
 "AGENDA_SIHAI": [
  {
   "id": "AGENDA_SIHAI_CLEARS_BARBARIAN_CAMPS",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_CLEARS_BARBARIAN_CAMPS",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_ATTACKS_BARBARIANS",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_SIHAI_ATTACKS_BARBARIANS"
   }
  },
  {
   "id": "AGENDA_SIHAI_IGNORES_BARBARIAN_CAMPS",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_IGNORES_BARBARIAN_CAMPS",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDOS_LEADER_ANY_REASON_AGENDA_IGNORES_BARBARIANS",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_SIHAI_IGNORES_BARBARIANS"
   }
  }
 ],
 "AGENDA_YINDING": [
  {
   "id": "AGENDA_YINDING_POSITIVE_INCOME",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_POSITIVE_INCOME",
   "args": {
    "InitialValue": "3",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_POSITIVE_INCOME",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_POSITIVE_INCOME"
   }
  },
  {
   "id": "AGENDA_YINDING_NEGATIVE_INCOME",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_NEGATIVE_INCOME",
   "args": {
    "InitialValue": "-12",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_NEGATIVE_INCOME",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_NEGATIVE_INCOME"
   }
  }
 ],
 "AGENDA_COURT_INTRIGUE": [
  {
   "id": "AGENDA_COURT_INTRIGUE",
   "type": "AGENDA_PARANOID",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_30_TURNS",
   "args": {
    "StatementKey": "AGENDA_PARANOID_WARNING"
   }
  }
 ],
 "AGENDA_TRADE_AGREEMENT": [
  {
   "id": "AGENDA_TRADE_AGREEMENT",
   "type": "TRADE_RELATIONS",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_30_TURNS",
   "args": {
    "TradeBonus": "3",
    "NoTradePenalty": "12",
    "BonusPerRoute": "true",
    "OnlyInboundTrade": "true",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ELIZABETH_REASON_ANY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_WILHELMINA_BILLIONAIRE_TRADE"
   }
  }
 ],
 "AGENDA_SAGA": [
  {
   "id": "AGENDA_SAGA_HIGH_PROTECT_CITY_STATES",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_HIGH_CITY_STATE_PROTECTION",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_PROTECTS_CITY_STATES",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_HIGH_CITY_STATE_PROTECTION"
   }
  },
  {
   "id": "AGENDA_SAGA_MED_PROTECT_CITY_STATES",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_MED_CITY_STATE_PROTECTION",
   "args": {
    "InitialValue": "3",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_PROTECTS_CITY_STATES",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_MED_CITY_STATE_PROTECTION"
   }
  },
  {
   "id": "AGENDA_SAGA_MED_ATTACK_CITY_STATES",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_MED_CITY_STATE_AGGRESSION",
   "args": {
    "InitialValue": "-3",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_ATTACKS_CITY_STATES",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_MED_CITY_STATE_AGGRESSION"
   }
  },
  {
   "id": "AGENDA_SAGA_HIGH_ATTACK_CITY_STATES",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_HIGH_CITY_STATE_AGGRESSION",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_ATTACKS_CITY_STATES",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_HIGH_CITY_STATE_AGGRESSION"
   }
  }
 ],
 "AGENDA_INDUSTRIAL_REVOLUTION": [
  {
   "id": "AGENDA_HIGH_INDUSTRY_ENGLAND",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_HIGH_INDUSTRY",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_HIGH_INDUSTRY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_HIGH_INDUSTRY"
   }
  },
  {
   "id": "AGENDA_LOW_INDUSTRY_ENGLAND",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_LOW_INDUSTRY",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_LOW_INDUSTRY",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_LOW_INDUSTRY"
   }
  }
 ],
 "AGENDA_MAAT": [
  {
   "id": "AGENDA_MAAT",
   "type": "AGENDA_EXPLOITATIVE",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_30_TURNS",
   "args": {
    "InitialValue": "0",
    "IncrementValue": "0",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_EXPLOITATION",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_EXPLOITATION",
    "TileImprovementHighThreshold": "75",
    "TileImprovementLowThreshold": "35",
    "PlotFeatureRemovalValue": "1",
    "NationalParkConstructionValue": "10",
    "TileImprovementPreferenceValue": "9",
    "MaxDiploModifierMagnitude": "10",
    "HighScoreThreshold": "15",
    "LowScoreThreshold": "-15"
   }
  }
 ],
 "AGENDA_PREFER_FOOD": [
  {
   "id": "AGENDA_HIGH_FOOD",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_HIGH_FOOD",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_HIGH_FOOD",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_HIGH_FOOD"
   }
  },
  {
   "id": "AGENDA_LOW_FOOD",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_LOW_FOOD",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_LOW_FOOD",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_LOW_FOOD"
   }
  }
 ],
 "AGENDA_LION_OF_MALI": [
  {
   "id": "AGENDA_HIGH_TOURISM_MALI",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_HIGH_TOURISM",
   "args": {
    "InitialValue": "-6",
    "StatementKey": "LOC_DIPLO_WARNING_LEADER_ANY_REASON_AGENDA_HIGH_TOURISM",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_HIGH_TOURISM"
   }
  },
  {
   "id": "AGENDA_LOW_TOURISM_MALI",
   "type": "SIMPLE_MODIFIER",
   "owner": null,
   "subject": "PLAYER_HAS_LOW_TOURISM",
   "args": {
    "InitialValue": "6",
    "StatementKey": "LOC_DIPLO_KUDO_LEADER_ANY_REASON_AGENDA_LOW_TOURISM",
    "SimpleModifierDescription": "LOC_DIPLO_MODIFIER_DESCRIPTION_LOW_TOURISM"
   }
  }
 ],
 "AGENDA_BULL_MOOSE": [
  {
   "id": "AGENDA_BULL_MOOSE",
   "type": "AGENDA_BULL_MOOSE",
   "owner": "ON_TURN_STARTED",
   "subject": "PLAYER_IS_MAJOR_CIV_KNOWN_10_TURNS",
   "args": {
    "StatementKey": "LOC_PLACEHOLDER"
   }
  }
 ]
};
export const DIPLO_REQUIREMENT_SETS: Readonly<Record<string, DiploRequirementSet>> = {
 "PLAYER_ALLY": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_PLAYER_ALLY",
    "type": "REQUIREMENT_ALLY",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_PLAYER_AT_PEACE",
    "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   }
  ]
 },
 "ON_TURN_STARTED": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_TURN_STARTED",
    "type": "REQUIREMENT_PLAYER_TURN_STARTED",
    "inverse": false,
    "args": {}
   }
  ]
 },
 "PLAYER_IS_KNOWN_MAJOR_CIV": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_PLAYERS_HAVE_MET",
    "type": "REQUIREMENT_PLAYER_HAS_MET",
    "inverse": false,
    "args": {}
   }
  ]
 },
 "PLAYER_CITY_CONVERTED": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_PLAYER_CITY_CONVERTED",
    "type": "REQUIREMENT_CITY_CONVERTED",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   }
  ]
 },
 "PLAYER_CULTURE_BOMBED": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_PLAYER_CULTURE_BOMBED",
    "type": "REQUIREMENT_CULTURE_BOMBED",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   }
  ]
 },
 "PLAYER_DECLARED_FRIEND": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_PLAYER_DECLARED_FRIEND",
    "type": "REQUIREMENT_DECLARED_FRIEND",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_PLAYER_AT_PEACE",
    "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   }
  ]
 },
 "PLAYER_DEFENSIVE_PACT": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_PLAYER_DEFENSIVE_PACT",
    "type": "REQUIREMENT_DEFENSIVE_PACT",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_PLAYER_AT_PEACE",
    "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_PLAYER_NOT_ALLY",
    "type": "REQUIREMENT_ALLY",
    "inverse": true,
    "args": {}
   }
  ]
 },
 "PLAYER_DELEGATION": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_PLAYER_DELEGATION",
    "type": "REQUIREMENT_DELEGATION",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_PLAYER_AT_PEACE",
    "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   }
  ]
 },
 "PLAYER_RECEIVED_DEMAND": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_PLAYER_RECEIVED_DEMAND",
    "type": "REQUIREMENT_DEMAND_RECEIVED",
    "inverse": false,
    "args": {}
   }
  ]
 },
 "PLAYER_DENOUNCED": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_PLAYER_DENOUNCED",
    "type": "REQUIREMENT_DENOUNCED",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   }
  ]
 },
 "ON_ESPIONAGE_DETECTED": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_ESPIONAGE_DETECTED",
    "type": "REQUIREMENT_ESPIONAGE_DETECTED",
    "inverse": false,
    "args": {}
   }
  ]
 },
 "PLAYER_HAD_FRIENDLY_MEETING": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_PLAYER_HAD_FRIENDLY_MEETING",
    "type": "REQUIREMENT_HAD_FRIENDLY_MEETING",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_PLAYER_AT_PEACE",
    "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   }
  ]
 },
 "PLAYER_HAS_SAME_GOVERNMENT": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_PLAYERS_HAVE_MET",
    "type": "REQUIREMENT_PLAYER_HAS_MET",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_SAME_GOVERNMENT",
    "type": "REQUIREMENT_PLAYER_HAS_SAME_GOVERNMENT",
    "inverse": false,
    "args": {}
   }
  ]
 },
 "PLAYER_HAS_DIFFERENT_GOVERNMENT": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_PLAYERS_HAVE_MET",
    "type": "REQUIREMENT_PLAYER_HAS_MET",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_DIFFERENT_GOVERNMENT",
    "type": "REQUIREMENT_PLAYER_HAS_SAME_GOVERNMENT",
    "inverse": true,
    "args": {}
   }
  ]
 },
 "PLAYER_IS_KNOWN_BUT_NO_OPEN_BORDERS": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_PLAYER_NO_OPEN_BORDERS",
    "type": "REQUIREMENT_OPEN_BORDERS",
    "inverse": true,
    "args": {
     "GracePeriod": "2"
    }
   },
   {
    "id": "REQUIRES_PLAYER_NEAR_CULTURE_BORDER",
    "type": "REQUIREMENT_NEAR_CULTURE_BORDER",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_AT_PEACE_10_TURNS",
    "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
    "inverse": false,
    "args": {
     "Min Turns": "10"
    }
   },
   {
    "id": "REQUIRES_PLAYERS_HAVE_MET",
    "type": "REQUIREMENT_PLAYER_HAS_MET",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   }
  ]
 },
 "PLAYER_DECLARES_JOINT_WAR": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_PLAYER_DECLARED_JOINT_WAR",
    "type": "REQUIREMENT_PLAYER_DECLARED_WAR",
    "inverse": false,
    "args": {
     "WarType": "JOINT_WAR"
    }
   },
   {
    "id": "REQUIRES_PLAYERS_HAVE_MET",
    "type": "REQUIREMENT_PLAYER_HAS_MET",
    "inverse": false,
    "args": {}
   }
  ]
 },
 "PLAYER_NEAR_CULTURE_BORDER": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_PLAYER_NEAR_CULTURE_BORDER",
    "type": "REQUIREMENT_NEAR_CULTURE_BORDER",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_PLAYER_AT_PEACE",
    "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_PLAYER_NOT_ALLY",
    "type": "REQUIREMENT_ALLY",
    "inverse": true,
    "args": {}
   }
  ]
 },
 "PLAYER_MY_CITY_LIBERATED": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_PLAYER_MY_CITY_LIBERATED",
    "type": "REQUIREMENT_CITY_LIBERATED",
    "inverse": false,
    "args": {
     "OnlyOwnersCity": "True"
    }
   },
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   }
  ]
 },
 "PLAYER_CITY_OCCUPIED": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_PLAYER_CITY_OCCUPIED",
    "type": "REQUIREMENT_CITY_OCCUPIED",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   }
  ]
 },
 "PLAYER_CITY_OCCUPIED_FRIEND": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_PLAYER_CITY_OCCUPIED_FRIEND",
    "type": "REQUIREMENT_CITY_OCCUPIED_FRIEND",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_PLAYERS_HAVE_MET",
    "type": "REQUIREMENT_PLAYER_HAS_MET",
    "inverse": false,
    "args": {}
   }
  ]
 },
 "ON_DEAL_ENACTED": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_DEAL_ENACTED",
    "type": "REQUIREMENT_PLAYER_DEAL_ENACTED",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   }
  ]
 },
 "PLAYER_OPEN_BORDERS": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_PLAYER_OPEN_BORDERS",
    "type": "REQUIREMENT_OPEN_BORDERS",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_PLAYER_AT_PEACE",
    "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   }
  ]
 },
 "PLAYER_MY_CITY_RAZED": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_PLAYER_MY_CITY_RAZED",
    "type": "REQUIREMENT_CITY_RAZED",
    "inverse": false,
    "args": {
     "OnlyOwnersCity": "True"
    }
   },
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   }
  ]
 },
 "PLAYER_ACCEPT_CONVERSION": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_PLAYER_FOUNDED_OUR_RELIGION",
    "type": "REQUIREMENT_PLAYER_FOUNDED_OUR_RELIGION",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_FOUNDED_NO_RELIGION",
    "type": "REQUIREMENT_FOUNDED_NO_RELIGION",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_PLAYERS_HAVE_MET",
    "type": "REQUIREMENT_PLAYER_HAS_MET",
    "inverse": false,
    "args": {}
   }
  ]
 },
 "PLAYER_IS_AT_PEACE": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_PLAYER_AT_PEACE",
    "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   }
  ]
 },
 "PLAYER_IS_MAJOR_CIV": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_PLAYERS_HAVE_MET",
    "type": "REQUIREMENT_PLAYER_HAS_MET",
    "inverse": false,
    "args": {}
   }
  ]
 },
 "PLAYER_RESIDENT_EMBASSY": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_PLAYER_RESIDENT_EMBASSY",
    "type": "REQUIREMENT_RESIDENT_EMBASSY",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_PLAYER_AT_PEACE",
    "type": "REQUIREMENT_PLAYER_IS_AT_PEACE",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   }
  ]
 },
 "PLAYER_IS_NEW_WARMONGER_SUBJECT": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_PLAYERS_HAVE_MET",
    "type": "REQUIREMENT_PLAYER_HAS_MET",
    "inverse": false,
    "args": {}
   }
  ]
 },
 "PLAYER_SHARES_EMERGENCY": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_SHARED_EMERGENCY",
    "type": "REQUIREMENT_PLAYER_IN_JOINT_EMERGENCY",
    "inverse": false,
    "args": {
     "HostileOnly": "true"
    }
   }
  ]
 },
 "PLAYER_HAS_HIGH_AIRPOWER": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_PLAYER_HAS_FLIGHT",
    "type": "REQUIREMENT_PLAYER_HAS_TECHNOLOGY",
    "inverse": false,
    "args": {
     "TechnologyType": "TECH_FLIGHT"
    }
   },
   {
    "id": "REQUIRES_HAS_HIGH_AIRPOWER",
    "type": "REQUIREMENT_PLAYER_MILITARY_STRENGTH_LEAD",
    "inverse": false,
    "args": {
     "MinimumDelta": "5",
     "StrengthRatio": "1.2",
     "DomainType": "DOMAIN_AIR"
    }
   }
  ]
 },
 "PLAYER_HAS_LOW_AIRPOWER": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_PLAYER_HAS_FLIGHT",
    "type": "REQUIREMENT_PLAYER_HAS_TECHNOLOGY",
    "inverse": false,
    "args": {
     "TechnologyType": "TECH_FLIGHT"
    }
   },
   {
    "id": "REQUIRES_HAS_LOW_AIRPOWER",
    "type": "REQUIREMENT_PLAYER_MILITARY_STRENGTH_LEAD",
    "inverse": false,
    "args": {
     "MinimumDelta": "5",
     "StrengthRatio": "-1.2",
     "DomainType": "DOMAIN_AIR"
    }
   }
  ]
 },
 "PLAYER_HAS_HIGH_CITY_STATE_PROTECTION": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HIGH_CITY_STATE_PROTECTION",
    "type": "REQUIREMENT_PLAYER_CITY_STATE_PROTECTOR",
    "inverse": false,
    "args": {
     "NoUpperBound": "true",
     "LowerBound": "2"
    }
   }
  ]
 },
 "PLAYER_HAS_MED_CITY_STATE_PROTECTION": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_MED_CITY_STATE_PROTECTION",
    "type": "REQUIREMENT_PLAYER_CITY_STATE_PROTECTOR",
    "inverse": false,
    "args": {
     "UpperBound": "1",
     "LowerBound": "1"
    }
   }
  ]
 },
 "PLAYER_HAS_MED_CITY_STATE_AGGRESSION": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_MED_CITY_STATE_AGGRESSION",
    "type": "REQUIREMENT_PLAYER_CITY_STATE_PROTECTOR",
    "inverse": false,
    "args": {
     "UpperBound": "-1",
     "LowerBound": "-1"
    }
   }
  ]
 },
 "PLAYER_HAS_HIGH_CITY_STATE_AGGRESSION": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HIGH_CITY_STATE_AGGRESSION",
    "type": "REQUIREMENT_PLAYER_CITY_STATE_PROTECTOR",
    "inverse": false,
    "args": {
     "NoLowerBound": "true",
     "UpperBound": "-2"
    }
   }
  ]
 },
 "PLAYER_CLEARS_BARBARIAN_CAMPS": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_PLAYERS_HAVE_MET",
    "type": "REQUIREMENT_PLAYER_HAS_MET",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_CLEARS_BARBARIAN_CAMPS",
    "type": "REQUIREMENT_PLAYER_CIVILIZED",
    "inverse": false,
    "args": {
     "ClearedCampValue": "1",
     "IgnoredCampValue": "1",
     "CampToCityDistance": "10",
     "TotalScoreThreshold": "0"
    }
   }
  ]
 },
 "PLAYER_IGNORES_BARBARIAN_CAMPS": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_IGNORES_BARBARIAN_CAMPS",
    "type": "REQUIREMENT_PLAYER_CIVILIZED",
    "inverse": false,
    "args": {
     "ClearedCampValue": "1",
     "IgnoredCampValue": "1",
     "CampToCityDistance": "10",
     "TotalScoreThreshold": "1",
     "BelowThreshold": "true"
    }
   }
  ]
 },
 "PLAYER_HAS_HIGH_CULTURE": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_HIGH_CULTURE",
    "type": "REQUIREMENT_PLAYER_YIELD_LEAD",
    "inverse": false,
    "args": {
     "MinimumDelta": "5",
     "YieldType": "YIELD_CULTURE",
     "YieldRatio": "1.15"
    }
   }
  ]
 },
 "PLAYER_HAS_LOW_CULTURE": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_LOW_CULTURE",
    "type": "REQUIREMENT_PLAYER_YIELD_LEAD",
    "inverse": false,
    "args": {
     "MinimumDelta": "5",
     "YieldType": "YIELD_CULTURE",
     "YieldRatio": "-1.15"
    }
   }
  ]
 },
 "PLAYER_HAS_HIGH_FAITH": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_HIGH_FAITH",
    "type": "REQUIREMENT_PLAYER_YIELD_LEAD",
    "inverse": false,
    "args": {
     "MinimumDelta": "5",
     "YieldType": "YIELD_FAITH",
     "YieldRatio": "1.15"
    }
   }
  ]
 },
 "PLAYER_HAS_LOW_FAITH": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_LOW_FAITH",
    "type": "REQUIREMENT_PLAYER_YIELD_LEAD",
    "inverse": false,
    "args": {
     "MinimumDelta": "5",
     "YieldType": "YIELD_FAITH",
     "YieldRatio": "-1.15"
    }
   }
  ]
 },
 "PLAYER_IS_MAJOR_CIV_KNOWN_30_TURNS": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   }
  ]
 },
 "PLAYER_HAS_HIGH_EXPLORATION": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_HIGH_EXPLORATION",
    "type": "REQUIREMENT_PLAYER_EXPLORATION_LEAD",
    "inverse": false,
    "args": {
     "MinimumDelta": "5",
     "ExplorationRatio": "1.1"
    }
   }
  ]
 },
 "PLAYER_HAS_LOW_EXPLORATION": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_LOW_EXPLORATION",
    "type": "REQUIREMENT_PLAYER_EXPLORATION_LEAD",
    "inverse": false,
    "args": {
     "MinimumDelta": "5",
     "ExplorationRatio": "-1.1"
    }
   }
  ]
 },
 "PLAYER_HAS_HIGH_HAPPINESS": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_HIGH_HAPPINESS",
    "type": "REQUIREMENT_PLAYER_HAPPINESS_LEAD",
    "inverse": false,
    "args": {
     "MinimumDelta": "2",
     "HappinessRatio": "1.3"
    }
   }
  ]
 },
 "PLAYER_HAS_LOW_HAPPINESS": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_LOW_HAPPINESS",
    "type": "REQUIREMENT_PLAYER_HAPPINESS_LEAD",
    "inverse": false,
    "args": {
     "MinimumDelta": "2",
     "HappinessRatio": "-1.3"
    }
   }
  ]
 },
 "PLAYER_LAGS_GREAT_PEOPLE": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_10_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "10"
    }
   },
   {
    "id": "REQUIRES_LAGS_GREAT_PEOPLE",
    "type": "REQUIREMENT_PLAYER_GOT_GREAT_PERSON",
    "inverse": false,
    "args": {
     "GreatPersonRatio": "-1.2",
     "MinimumDelta": "2"
    }
   }
  ]
 },
 "PLAYER_LEADS_GREAT_PEOPLE": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_10_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "10"
    }
   },
   {
    "id": "REQUIRES_LEADS_GREAT_PEOPLE",
    "type": "REQUIREMENT_PLAYER_GOT_GREAT_PERSON",
    "inverse": false,
    "args": {
     "GreatPersonRatio": "1.2",
     "MinimumDelta": "2"
    }
   }
  ]
 },
 "AGENDA_REQUIRE_PLAYER_HAS_SAME_GOVERNMENT": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_SAME_GOVERNMENT",
    "type": "REQUIREMENT_PLAYER_HAS_SAME_GOVERNMENT",
    "inverse": false,
    "args": {}
   }
  ]
 },
 "AGENDA_REQUIRE_PLAYER_HAS_DIFFERENT_GOVERNMENT": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_DIFFERENT_GOVERNMENT",
    "type": "REQUIREMENT_PLAYER_HAS_SAME_GOVERNMENT",
    "inverse": true,
    "args": {}
   }
  ]
 },
 "PLAYER_HAS_HIGH_INDUSTRY": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_HIGH_INDUSTRY",
    "type": "REQUIREMENT_PLAYER_YIELD_LEAD",
    "inverse": false,
    "args": {
     "MinimumDelta": "5",
     "YieldType": "YIELD_PRODUCTION",
     "YieldRatio": "1.15"
    }
   }
  ]
 },
 "PLAYER_HAS_LOW_INDUSTRY": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_LOW_INDUSTRY",
    "type": "REQUIREMENT_PLAYER_YIELD_LEAD",
    "inverse": false,
    "args": {
     "MinimumDelta": "5",
     "YieldType": "YIELD_PRODUCTION",
     "YieldRatio": "-1.15"
    }
   }
  ]
 },
 "PLAYER_HAS_NUCLEAR_FISSION_REQUIREMENT": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_PLAYER_HAS_NUCLEAR_FISSION",
    "type": "REQUIREMENT_PLAYER_HAS_TECHNOLOGY",
    "inverse": false,
    "args": {
     "TechnologyType": "TECH_NUCLEAR_FISSION"
    }
   }
  ]
 },
 "PLAYER_HAS_HIGH_NUKE_LOVE": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HIGH_NUKE_LOVE",
    "type": "REQUIREMENT_PLAYER_NUKE_LOVER",
    "inverse": false,
    "args": {
     "UsedNukeValue": "1",
     "BuiltNukeValue": "1",
     "TotalScoreThreshold": "0"
    }
   }
  ]
 },
 "PLAYER_HAS_LOW_NUKE_LOVE": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_LOW_NUKE_LOVE",
    "type": "REQUIREMENT_PLAYER_NUKE_LOVER",
    "inverse": false,
    "args": {
     "UsedNukeValue": "1",
     "BuiltNukeValue": "1",
     "TotalScoreThreshold": "1",
     "BelowThreshold": "true"
    }
   }
  ]
 },
 "PLAYER_HAS_HIGH_POPULATION": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_HIGH_POPULATION",
    "type": "REQUIREMENT_PLAYER_POPULATION_LEAD",
    "inverse": false,
    "args": {
     "MinimumDelta": "3",
     "PopulationRatio": "1.1"
    }
   }
  ]
 },
 "PLAYER_HAS_LOW_POPULATION": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_LOW_POPULATION",
    "type": "REQUIREMENT_PLAYER_POPULATION_LEAD",
    "inverse": false,
    "args": {
     "MinimumDelta": "3",
     "PopulationRatio": "-1.1"
    }
   }
  ]
 },
 "PLAYER_HAS_HIGH_STANDING_ARMY": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_HIGH_STANDING_ARMY",
    "type": "REQUIREMENT_PLAYER_MILITARY_STRENGTH_LEAD",
    "inverse": false,
    "args": {
     "MinimumDelta": "5",
     "StrengthRatio": "1.2",
     "DomainType": "DOMAIN_LAND"
    }
   }
  ]
 },
 "PLAYER_HAS_LOW_STANDING_ARMY": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_LOW_STANDING_ARMY",
    "type": "REQUIREMENT_PLAYER_MILITARY_STRENGTH_LEAD",
    "inverse": false,
    "args": {
     "MinimumDelta": "5",
     "StrengthRatio": "-1.2",
     "DomainType": "DOMAIN_LAND"
    }
   }
  ]
 },
 "PLAYER_HAS_HIGH_SCIENCE": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_HIGH_SCIENCE",
    "type": "REQUIREMENT_PLAYER_YIELD_LEAD",
    "inverse": false,
    "args": {
     "MinimumDelta": "5",
     "YieldType": "YIELD_SCIENCE",
     "YieldRatio": "1.15"
    }
   }
  ]
 },
 "PLAYER_HAS_LOW_SCIENCE": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_LOW_SCIENCE",
    "type": "REQUIREMENT_PLAYER_YIELD_LEAD",
    "inverse": false,
    "args": {
     "MinimumDelta": "5",
     "YieldType": "YIELD_SCIENCE",
     "YieldRatio": "-1.15"
    }
   }
  ]
 },
 "PLAYER_LAGS_WONDERS": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_10_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "10"
    }
   },
   {
    "id": "REQUIRES_LAGS_WONDERS",
    "type": "REQUIREMENT_PLAYER_BUILT_WONDER",
    "inverse": false,
    "args": {
     "WonderRatio": "-1.2"
    }
   }
  ]
 },
 "PLAYER_LEADS_WONDERS": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_10_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "10"
    }
   },
   {
    "id": "REQUIRES_LEADS_WONDERS",
    "type": "REQUIREMENT_PLAYER_BUILT_WONDER",
    "inverse": false,
    "args": {
     "WonderRatio": "1.2"
    }
   }
  ]
 },
 "PLAYER_FRIEND_DENOUNCED": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_PLAYER_FRIEND_DENOUNCED",
    "type": "REQUIREMENT_DENOUNCED_FRIEND",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_PLAYERS_HAVE_MET",
    "type": "REQUIREMENT_PLAYER_HAS_MET",
    "inverse": false,
    "args": {}
   }
  ]
 },
 "PLAYER_DECLARES_SURPRISE_WAR": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_PLAYER_DECLARED_SURPRISE_WAR",
    "type": "REQUIREMENT_PLAYER_DECLARED_WAR",
    "inverse": false,
    "args": {
     "WarType": "SURPRISE_WAR",
     "WhileMet": "true"
    }
   },
   {
    "id": "REQUIRES_PLAYERS_HAVE_MET",
    "type": "REQUIREMENT_PLAYER_HAS_MET",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   }
  ]
 },
 "PLAYER_ATTACKED_CONTINENT": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_PLAYERS_HAVE_MET",
    "type": "REQUIREMENT_PLAYER_HAS_MET",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_ATTACKED_CONTINENT",
    "type": "REQUIREMENT_PLAYER_ATTACKED_CONTINENT",
    "inverse": false,
    "args": {}
   }
  ]
 },
 "PLAYER_PEACEFUL_ON_CONTINENT": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_10_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "10"
    }
   },
   {
    "id": "REQUIRES_PEACEFUL_ON_CONTINENT",
    "type": "REQUIREMENT_PLAYER_PEACEFUL_ON_CONTINENT",
    "inverse": false,
    "args": {}
   }
  ]
 },
 "PLAYER_IS_MAJOR_CIV_KNOWN_10_TURNS": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_10_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "10"
    }
   }
  ]
 },
 "PLAYER_NOT_COMPETING_MINORS": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_10_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "10"
    }
   },
   {
    "id": "REQUIRES_NOT_COMPETING_MINORS",
    "type": "REQUIREMENT_PLAYER_NOT_COMPETING_MINORS",
    "inverse": false,
    "args": {}
   }
  ]
 },
 "PLAYER_COMPETING_MINORS": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_10_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "10"
    }
   },
   {
    "id": "REQUIRES_COMPETING_MINORS",
    "type": "REQUIREMENT_PLAYER_COMPETING_MINORS",
    "inverse": false,
    "args": {
     "PercentCompeting": "50"
    }
   }
  ]
 },
 "PLAYER_SAME_RELIGION": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_10_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "10"
    }
   },
   {
    "id": "REQUIRES_SAME_RELIGION",
    "type": "REQUIREMENT_PLAYER_IS_SAME_RELIGION",
    "inverse": false,
    "args": {}
   }
  ]
 },
 "PLAYER_ENCROACHING_RELIGION": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_10_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "10"
    }
   },
   {
    "id": "REQUIRES_PLAYER_CITY_CONVERTED",
    "type": "REQUIREMENT_CITY_CONVERTED",
    "inverse": false,
    "args": {}
   }
  ]
 },
 "PLAYER_RELIGION_RECEIVED": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_10_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "10"
    }
   },
   {
    "id": "REQUIRES_RELIGION_RECEIVED",
    "type": "REQUIREMENT_PLAYER_RELIGION_RECEIVED",
    "inverse": false,
    "args": {}
   }
  ]
 },
 "PLAYER_RELIGION_NOT_RECEIVED": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_10_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "10"
    }
   },
   {
    "id": "REQUIRES_RELIGION_NOT_RECEIVED",
    "type": "REQUIREMENT_PLAYER_RELIGION_NOT_RECEIVED",
    "inverse": false,
    "args": {
     "FoundingDelay": "10"
    }
   }
  ]
 },
 "PLAYER_NOT_INVOLVED_MINORS": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_10_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "10"
    }
   },
   {
    "id": "REQUIRES_NOT_INVOLVED_MINORS",
    "type": "REQUIREMENT_PLAYER_NOT_INVOLVED_MINORS",
    "inverse": false,
    "args": {}
   }
  ]
 },
 "PLAYER_CONQUERING_ALLYING_MINORS": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_10_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "10"
    }
   },
   {
    "id": "REQUIRES_CONQUERING_ALLYING_MINORS",
    "type": "REQUIREMENT_PLAYER_CONQUERING_ALLYING_MINORS",
    "inverse": false,
    "args": {}
   }
  ]
 },
 "PLAYER_NOT_WARMONGER_SUBJECT": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_10_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "10"
    }
   },
   {
    "id": "REQUIRES_NOT_WARMONGER_SUBJECT",
    "type": "REQUIREMENT_PLAYER_IS_NOT_WARMONGER",
    "inverse": false,
    "args": {}
   }
  ]
 },
 "PLAYER_IS_WARMONGER_SUBJECT": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_PLAYERS_HAVE_MET",
    "type": "REQUIREMENT_PLAYER_HAS_MET",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_WARMONGER_TRIGGER",
    "type": "REQUIREMENT_REQUIREMENTSET_IS_MET",
    "inverse": false,
    "args": {
     "RequirementSetId": "WARMONGER_TRIGGERS",
     "OnlyOwnersCity": "False"
    }
   }
  ]
 },
 "WARMONGER_TRIGGERS": {
  "any": true,
  "reqs": [
   {
    "id": "REQUIRES_PLAYER_DECLARED_WAR_EXCLUDE_SHARED_EMERGENCIES",
    "type": "REQUIREMENT_PLAYER_DECLARED_WAR",
    "inverse": false,
    "args": {
     "WhileMet": "True",
     "ExcludeEmergencies": "True"
    }
   },
   {
    "id": "REQUIRES_PLAYER_CITY_OCCUPIED_TRIGGERED",
    "type": "REQUIREMENT_CITY_OCCUPIED",
    "inverse": false,
    "args": {}
   }
  ]
 },
 "PLAYER_SAME_HOME_CONTINENT": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_10_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "10"
    }
   },
   {
    "id": "REQUIRES_SAME_HOME_CONTINENT",
    "type": "REQUIREMENT_PLAYER_SHARES_HOME_CONTINENT",
    "inverse": false,
    "args": {}
   }
  ]
 },
 "PLAYER_ON_NEW_CONTINENT": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_10_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "10"
    }
   },
   {
    "id": "REQUIRES_ON_NEW_CONTINENT",
    "type": "REQUIREMENT_PLAYER_ON_NON_HOME_CONTINENT",
    "inverse": false,
    "args": {}
   }
  ]
 },
 "PLAYER_HAS_DESIRED_LUXURY": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_10_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "10"
    }
   },
   {
    "id": "REQUIRES_HAS_DESIRED_LUXURY",
    "type": "REQUIREMENT_PLAYER_HAS_DESIRED_LUXURY",
    "inverse": false,
    "args": {}
   }
  ]
 },
 "PLAYER_HAS_NO_DESIRED_LUXURY": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_10_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "10"
    }
   },
   {
    "id": "REQUIRES_HAS_NO_DESIRED_LUXURY",
    "type": "REQUIREMENT_PLAYER_HAS_DESIRED_LUXURY",
    "inverse": true,
    "args": {}
   }
  ]
 },
 "PLAYER_LAGS_PROGRESS": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_10_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "10"
    }
   },
   {
    "id": "REQUIRES_LAGS_PROGRESS",
    "type": "REQUIREMENT_PLAYER_FINISHED_RESEARCH",
    "inverse": false,
    "args": {
     "TechCivicDifferential": "-3"
    }
   }
  ]
 },
 "PLAYER_LEADS_PROGRESS": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_10_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "10"
    }
   },
   {
    "id": "REQUIRES_LEADS_PROGRESS",
    "type": "REQUIREMENT_PLAYER_FINISHED_RESEARCH",
    "inverse": false,
    "args": {
     "TechCivicDifferential": "3"
    }
   }
  ]
 },
 "PLAYER_WITH_SHIELD_OR_ON_IT": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_PLAYERS_HAVE_MET",
    "type": "REQUIREMENT_PLAYER_HAS_MET",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_MET_10_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "10"
    }
   },
   {
    "id": "REQUIRES_PLAYER_WITH_SHIELD_OR_ON_IT",
    "type": "REQUIREMENT_PLAYER_WITH_SHIELD_OR_ON_IT",
    "inverse": false,
    "args": {
     "AgreementValue": "0"
    }
   }
  ]
 },
 "PLAYER_AT_WAR_WITH_NEIGHBORS": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_10_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "10"
    }
   },
   {
    "id": "REQUIRES_AT_WAR_WITH_NEIGHBORS",
    "type": "REQUIREMENT_PLAYER_AT_WAR_WITH_NEIGHBOR",
    "inverse": false,
    "args": {}
   }
  ]
 },
 "PLAYER_NOT_AT_WAR_WITH_NEIGHBORS": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_10_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "10"
    }
   },
   {
    "id": "REQUIRES_NOT_AT_WAR_WITH_NEIGHBORS",
    "type": "REQUIREMENT_PLAYER_AT_WAR_WITH_NEIGHBOR",
    "inverse": true,
    "args": {}
   }
  ]
 },
 "PLAYER_HAS_MANY_ALLIANCES": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_HAS_MANY_ALLIANCES",
    "type": "REQUIREMENT_PLAYER_HAS_MANY_ALLIANCES",
    "inverse": false,
    "args": {
     "MinOwnerAlliances": "1"
    }
   },
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_10_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "10"
    }
   }
  ]
 },
 "PLAYER_HAS_FEW_ALLIANCES": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_HAS_FEW_ALLIANCES",
    "type": "REQUIREMENT_PLAYER_HAS_MANY_ALLIANCES",
    "inverse": false,
    "args": {
     "MinOwnerAlliances": "1",
     "ChecKForFewer": "true"
    }
   },
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_10_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "10"
    }
   }
  ]
 },
 "PLAYERS_ARE_NEIGHBORS": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_NEIGHBOR_CIVS",
    "type": "REQUIREMENT_PLAYER_IS_NEIGHBOR",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_MET_10_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "10"
    }
   }
  ]
 },
 "PLAYERS_ARE_NOT_NEIGHBORS": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_NOT_NEIGHBOR_CIVS",
    "type": "REQUIREMENT_PLAYER_IS_NEIGHBOR",
    "inverse": true,
    "args": {}
   },
   {
    "id": "REQUIRES_MET_10_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "10"
    }
   }
  ]
 },
 "PLAYER_HAS_HIGH_WALLS": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_10_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "10"
    }
   },
   {
    "id": "REQUIRES_HAS_HIGH_WALLS",
    "type": "REQUIREMENT_PLAYER_AVERAGE_WALL_LEVEL_THRESHOLD",
    "inverse": false,
    "args": {
     "AverageWallLevelThreshold": "1.0",
     "AboveThreshold": "true"
    }
   }
  ]
 },
 "PLAYER_HAS_LOW_WALLS": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_10_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "10"
    }
   },
   {
    "id": "REQUIRES_HAS_LOW_WALLS",
    "type": "REQUIREMENT_PLAYER_AVERAGE_WALL_LEVEL_THRESHOLD",
    "inverse": false,
    "args": {
     "AverageWallLevelThreshold": "0.5",
     "AboveThreshold": "false"
    }
   }
  ]
 },
 "PLAYER_IS_SHARING_INFO": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_SHARING_INFO",
    "type": "REQUIREMENT_PLAYER_IS_SHARING_INFO",
    "inverse": false,
    "args": {
     "SharingInfoWell": "true"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   }
  ]
 },
 "PLAYER_IS_NOT_SHARING_INFO": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_NOT_SHARING_INFO",
    "type": "REQUIREMENT_PLAYER_IS_SHARING_INFO",
    "inverse": false,
    "args": {
     "SharingInfoWell": "false"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   }
  ]
 },
 "PLAYER_HAS_GOLDEN_AGE_HAVE_MET": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_PLAYER_HAS_GOLDEN_AGE",
    "type": "REQUIREMENT_PLAYER_HAS_GOLDEN_AGE",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_PLAYERS_HAVE_MET",
    "type": "REQUIREMENT_PLAYER_HAS_MET",
    "inverse": false,
    "args": {}
   }
  ]
 },
 "PLAYER_HAS_DARK_AGE_HAVE_MET": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_PLAYER_HAS_DARK_AGE",
    "type": "REQUIREMENT_PLAYER_HAS_DARK_AGE",
    "inverse": false,
    "args": {}
   },
   {
    "id": "REQUIRES_PLAYERS_HAVE_MET",
    "type": "REQUIREMENT_PLAYER_HAS_MET",
    "inverse": false,
    "args": {}
   }
  ]
 },
 "PLAYER_HAS_HIGH_FAVOR": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_HIGH_FAVOR",
    "type": "REQUIREMENT_PLAYER_FAVOR_LEAD",
    "inverse": false,
    "args": {
     "MinimumDelta": "10",
     "Ratio": "1.3"
    }
   }
  ]
 },
 "PLAYER_HAS_LOW_FAVOR": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_LOW_FAVOR",
    "type": "REQUIREMENT_PLAYER_FAVOR_LEAD",
    "inverse": false,
    "args": {
     "MinimumDelta": "10",
     "Ratio": "-1.3"
    }
   }
  ]
 },
 "PLAYER_HAS_HIGH_TOURISM": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_HIGH_TOURISM",
    "type": "REQUIREMENT_PLAYER_TOURISM_LEAD",
    "inverse": false,
    "args": {
     "MinimumDelta": "100",
     "Ratio": "1.3"
    }
   }
  ]
 },
 "PLAYER_HAS_LOW_TOURISM": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_LOW_TOURISM",
    "type": "REQUIREMENT_PLAYER_TOURISM_LEAD",
    "inverse": false,
    "args": {
     "MinimumDelta": "100",
     "Ratio": "-1.3"
    }
   }
  ]
 },
 "PLAYER_HAS_HIGH_DIPLOVP": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_HIGH_DIPLOVP",
    "type": "REQUIREMENT_PLAYER_DIPLO_VP_LEAD",
    "inverse": false,
    "args": {
     "MinimumDelta": "1",
     "Ratio": "1.5"
    }
   }
  ]
 },
 "PLAYER_HAS_LOW_DIPLOVP": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_LOW_DIPLOVP",
    "type": "REQUIREMENT_PLAYER_DIPLO_VP_LEAD",
    "inverse": false,
    "args": {
     "MinimumDelta": "1",
     "Ratio": "-1.5"
    }
   }
  ]
 },
 "PLAYER_HAS_HIGH_PILLAGE": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_HIGH_PILLAGE",
    "type": "REQUIREMENT_PLAYER_PILLAGE_LEAD",
    "inverse": false,
    "args": {
     "MinimumDelta": "5",
     "Ratio": "1.3"
    }
   }
  ]
 },
 "PLAYER_HAS_LOW_PILLAGE": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_LOW_PILLAGE",
    "type": "REQUIREMENT_PLAYER_PILLAGE_LEAD",
    "inverse": false,
    "args": {
     "MinimumDelta": "5",
     "Ratio": "-1.3"
    }
   }
  ]
 },
 "PLAYER_HAS_LOW_MOUNTAIN_CITIES": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_LOW_MOUNTAIN_CITIES",
    "type": "REQUIREMENT_PLAYER_MOUNTAIN_CITIES",
    "inverse": false,
    "args": {
     "MinimumCities": "3",
     "Percentage": "35",
     "BelowPercentage": "true",
     "DistanceToMountain": "2"
    }
   }
  ]
 },
 "PLAYER_HAS_HIGH_MOUNTAIN_CITIES": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_HIGH_MOUNTAIN_CITIES",
    "type": "REQUIREMENT_PLAYER_MOUNTAIN_CITIES",
    "inverse": false,
    "args": {
     "MinimumCities": "3",
     "Percentage": "65",
     "BelowPercentage": "false",
     "DistanceToMountain": "2"
    }
   }
  ]
 },
 "PLAYER_HAS_LOW_COASTAL_CITIES": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_LOW_COASTAL_CITIES",
    "type": "REQUIREMENT_PLAYER_COASTAL_CITIES",
    "inverse": false,
    "args": {
     "MinimumCities": "3",
     "Percentage": "40",
     "BelowPercentage": "true"
    }
   }
  ]
 },
 "PLAYER_HAS_HIGH_COASTAL_CITIES": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_HIGH_COASTAL_CITIES",
    "type": "REQUIREMENT_PLAYER_COASTAL_CITIES",
    "inverse": false,
    "args": {
     "MinimumCities": "3",
     "Percentage": "70",
     "BelowPercentage": "false"
    }
   }
  ]
 },
 "PLAYER_CITY_LIBERATED": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_PLAYER_CITY_LIBERATED",
    "type": "REQUIREMENT_CITY_LIBERATED",
    "inverse": false,
    "args": {
     "OnlyOwnersCity": "False"
    }
   },
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_PLAYERS_HAVE_MET",
    "type": "REQUIREMENT_PLAYER_HAS_MET",
    "inverse": false,
    "args": {}
   }
  ]
 },
 "PLAYER_LEADS_DISTRICTS_LUDWIG": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_LEADS_DISTRICTS_LUDWIG",
    "type": "REQUIREMENT_PLAYER_DISTRICT_THRESHOLD",
    "inverse": false,
    "args": {
     "DistrictPercentThreshold": "80",
     "MinDistrictsNeeded": "3",
     "AboveThreshold": "true"
    }
   }
  ]
 },
 "PLAYER_LAGS_DISTRICTS_LUDWIG": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_LAGS_DISTRICTS_LUDWIG",
    "type": "REQUIREMENT_PLAYER_DISTRICT_THRESHOLD",
    "inverse": false,
    "args": {
     "DistrictPercentThreshold": "60",
     "MinDistrictsNeeded": "3",
     "AboveThreshold": "false"
    }
   }
  ]
 },
 "PLAYER_LEADS_DISTRICTS": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_LEADS_DISTRICTS",
    "type": "REQUIREMENT_PLAYER_DISTRICT_THRESHOLD",
    "inverse": false,
    "args": {
     "DistrictPercentThreshold": "80",
     "MinDistrictsNeeded": "3",
     "AboveThreshold": "true"
    }
   }
  ]
 },
 "PLAYER_LAGS_DISTRICTS": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_LAGS_DISTRICTS",
    "type": "REQUIREMENT_PLAYER_DISTRICT_THRESHOLD",
    "inverse": false,
    "args": {
     "DistrictPercentThreshold": "60",
     "MinDistrictsNeeded": "3",
     "AboveThreshold": "false"
    }
   }
  ]
 },
 "PLAYER_HAS_POSITIVE_INCOME": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_POSITIVE_INCOME",
    "type": "REQUIREMENT_PLAYER_INCOME_LEAD",
    "inverse": false,
    "args": {
     "MinimumDelta": "0",
     "YieldRatio": "0.1"
    }
   }
  ]
 },
 "PLAYER_HAS_NEGATIVE_INCOME": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_NEGATIVE_INCOME",
    "type": "REQUIREMENT_PLAYER_INCOME_LEAD",
    "inverse": true,
    "args": {
     "MinimumDelta": "0",
     "YieldRatio": "0.1"
    }
   }
  ]
 },
 "PLAYER_HAS_HIGH_FOOD": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_HIGH_FOOD",
    "type": "REQUIREMENT_PLAYER_YIELD_LEAD",
    "inverse": false,
    "args": {
     "MinimumDelta": "5",
     "YieldType": "YIELD_FOOD",
     "YieldRatio": "1.15"
    }
   }
  ]
 },
 "PLAYER_HAS_LOW_FOOD": {
  "any": false,
  "reqs": [
   {
    "id": "REQUIRES_MAJOR_CIV_OPPONENT",
    "type": "REQUIREMENT_CIVILIZATION_LEVEL",
    "inverse": false,
    "args": {
     "OpponentCivLevel": "CIVILIZATION_LEVEL_FULL_CIV"
    }
   },
   {
    "id": "REQUIRES_MET_30_TURNS_AGO",
    "type": "REQUIREMENT_PLAYER_MET_X_TURNS_AGO",
    "inverse": false,
    "args": {
     "TurnsAgo": "30"
    }
   },
   {
    "id": "REQUIRES_HAS_LOW_FOOD",
    "type": "REQUIREMENT_PLAYER_YIELD_LEAD",
    "inverse": false,
    "args": {
     "MinimumDelta": "5",
     "YieldType": "YIELD_FOOD",
     "YieldRatio": "-1.15"
    }
   }
  ]
 }
};
export const DIPLO_AGENDAS: readonly string[] = [
 "AGENDA_AIRPOWER",
 "AGENDA_BARBARIAN_LOVER",
 "AGENDA_CITY_STATE_PROTECTOR",
 "AGENDA_CIVILIZED",
 "AGENDA_CULTURED",
 "AGENDA_DARWINIST",
 "AGENDA_DEVOUT",
 "AGENDA_ENVIRONMENTALIST",
 "AGENDA_EXPLOITATIVE",
 "AGENDA_EXPLORER",
 "AGENDA_FUN_LOVING",
 "AGENDA_GREAT_PERSON_ADVOCATE",
 "AGENDA_IDEOLOGUE",
 "AGENDA_INDUSTRIALIST",
 "AGENDA_MONEY_GRUBBER",
 "AGENDA_NATURALIST",
 "AGENDA_NUKE_LOVER",
 "AGENDA_PARANOID",
 "AGENDA_POPULOUS",
 "AGENDA_STANDING_ARMY",
 "AGENDA_TECHNOPHILE",
 "AGENDA_WONDER_ADVOCATE",
 "AGENDA_ALLY_OF_ENKIDU",
 "AGENDA_AYYUBID_DYNASTY",
 "AGENDA_BACKSTAB_AVERSE",
 "AGENDA_BIG_STICK_POLICY",
 "AGENDA_BLACK_QUEEN",
 "AGENDA_BUSHIDO",
 "AGENDA_CITY_STATE_ALLY",
 "AGENDA_COUNTER_REFORMER",
 "AGENDA_DELIAN_LEAGUE",
 "AGENDA_ENTHUSIASTIC_DISCIPLE",
 "AGENDA_GREAT_PERSON_OBSESSED",
 "AGENDA_IRON_CROWN",
 "AGENDA_LAST_VIKING_KING",
 "AGENDA_OPTIMUS_PRINCEPS",
 "AGENDA_PEACEKEEPER",
 "AGENDA_QUEEN_OF_NILE",
 "AGENDA_SUN_NEVER_SETS",
 "AGENDA_TLATOANI",
 "AGENDA_WESTERNIZER",
 "AGENDA_WITH_YOUR_SHIELD_OR_ON_IT",
 "AGENDA_WONDER_OBSESSED",
 "AGENDA_BILLIONAIRE",
 "AGENDA_CHEOMSEONGDAE",
 "AGENDA_FLOWER_OF_SCOTLAND",
 "AGENDA_HORSE_LORD",
 "AGENDA_HORN_CHEST_LOINS",
 "AGENDA_IRON_CONFEDERACY",
 "AGENDA_MAURYA_EMPIRE",
 "AGENDA_NARIKALA_FORTRESS",
 "AGENDA_SPIRIT_OF_TUCAPEL",
 "AGENDA_CURMUDGEON",
 "AGENDA_FLIRTATIOUS",
 "AGENDA_GOSSIP",
 "AGENDA_SYCOPHANT",
 "AGENDA_SYMPATHIZER",
 "AGENDA_DEMAGOGUE",
 "AGENDA_DESTINATION_CIV",
 "AGENDA_EXPANSIONIST",
 "AGENDA_FLAT_EARTHER",
 "AGENDA_GREAT_WHITE_FLEET",
 "AGENDA_INTOLERANT",
 "AGENDA_LIBERTARIAN",
 "AGENDA_PILLAGER",
 "AGENDA_TURTLER",
 "AGENDA_ZEALOT",
 "AGENDA_ANGEVIN_EMPIRE",
 "AGENDA_CANADIAN_EXPEDITIONARY",
 "AGENDA_KAITIAKITANGA",
 "AGENDA_LAWGIVER",
 "AGENDA_LORD_OF_MINES",
 "AGENDA_RAVEN_BANNER",
 "AGENDA_PATRON_OF_ARTS",
 "AGENDA_SAPA_INCA",
 "AGENDA_SICILIAN_WARS",
 "AGENDA_PERPETUALLY_ON_GUARD",
 "AGENDA_HAMMURABI_DISTRICTS",
 "AGENDA_BASIL_ZEALOT",
 "AGENDA_AMBIORIX_ARMY",
 "AGENDA_MAGNIFICENCES",
 "AGENDA_ETHIOPIAN_HIGHLANDS",
 "AGENDA_LADY_SIX_SKY",
 "AGENDA_SIMON_BOLIVAR",
 "AGENDA_ETERNAL",
 "AGENDA_NEW_ROME",
 "AGENDA_SEJONG",
 "AGENDA_PRESERVER_OF_THE_UNION",
 "AGENDA_SULTAN",
 "AGENDA_DECOLONIZATION",
 "AGENDA_SAKOKU",
 "AGENDA_PREFER_LANDPOWER",
 "AGENDA_GOLDEN_AGE",
 "AGENDA_ARCHIPELAGIC_STATE",
 "AGENDA_END_TO_SUFFERING",
 "AGENDA_GALLIC_WARS",
 "AGENDA_TRIEU_DEFENDER",
 "AGENDA_KUBLAI_PAX",
 "AGENDA_SHORT_LIFE_GLORY",
 "AGENDA_BACKSTABBER",
 "AGENDA_CITY_PLANNER",
 "AGENDA_SAINT",
 "AGENDA_JOAO_EXPLORER",
 "AGENDA_SIHAI",
 "AGENDA_YINDING",
 "AGENDA_COURT_INTRIGUE",
 "AGENDA_TRADE_AGREEMENT",
 "AGENDA_SAGA",
 "AGENDA_INDUSTRIAL_REVOLUTION",
 "AGENDA_MAAT",
 "AGENDA_PREFER_FOOD",
 "AGENDA_LION_OF_MALI",
 "AGENDA_BULL_MOOSE"
];
export const DIPLO_RANDOM_AGENDAS: readonly { agenda: string; gameLimit: number; tag: string | null; requiresReligion: boolean }[] = [
 {
  "agenda": "AGENDA_AIRPOWER",
  "gameLimit": -1,
  "tag": "AGENDA_LATE_ERA_ONLY",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_CITY_STATE_ALLY",
  "gameLimit": -1,
  "tag": "AGENDA_ANY_ERA",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_CITY_STATE_PROTECTOR",
  "gameLimit": -1,
  "tag": "AGENDA_EARLY_ERA_ONLY",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_CIVILIZED",
  "gameLimit": -1,
  "tag": "AGENDA_EARLY_ERA_ONLY",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_CULTURED",
  "gameLimit": -1,
  "tag": "AGENDA_LATE_ERA_ONLY",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_DARWINIST",
  "gameLimit": 3,
  "tag": "AGENDA_LATE_ERA_ONLY",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_DEVOUT",
  "gameLimit": -1,
  "tag": "AGENDA_EARLY_ERA_ONLY",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_ENVIRONMENTALIST",
  "gameLimit": -1,
  "tag": "AGENDA_LATE_ERA_ONLY",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_EXPLOITATIVE",
  "gameLimit": -1,
  "tag": "AGENDA_ANY_ERA",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_EXPLORER",
  "gameLimit": -1,
  "tag": "AGENDA_EARLY_ERA_ONLY",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_FUN_LOVING",
  "gameLimit": -1,
  "tag": "AGENDA_ANY_ERA",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_GREAT_PERSON_ADVOCATE",
  "gameLimit": -1,
  "tag": "AGENDA_ANY_ERA",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_IDEOLOGUE",
  "gameLimit": -1,
  "tag": "AGENDA_LATE_ERA_ONLY",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_INDUSTRIALIST",
  "gameLimit": -1,
  "tag": "AGENDA_ANY_ERA",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_MONEY_GRUBBER",
  "gameLimit": -1,
  "tag": "AGENDA_ANY_ERA",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_NUKE_LOVER",
  "gameLimit": 2,
  "tag": "AGENDA_LATE_ERA_ONLY",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_PARANOID",
  "gameLimit": -1,
  "tag": "AGENDA_ANY_ERA",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_POPULOUS",
  "gameLimit": -1,
  "tag": "AGENDA_ANY_ERA",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_STANDING_ARMY",
  "gameLimit": -1,
  "tag": "AGENDA_ANY_ERA",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_TECHNOPHILE",
  "gameLimit": -1,
  "tag": "AGENDA_LATE_ERA_ONLY",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_WONDER_ADVOCATE",
  "gameLimit": -1,
  "tag": "AGENDA_ANY_ERA",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_GOSSIP",
  "gameLimit": -1,
  "tag": "AGENDA_ANY_ERA",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_SYCOPHANT",
  "gameLimit": -1,
  "tag": "AGENDA_ANY_ERA",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_SYMPATHIZER",
  "gameLimit": -1,
  "tag": "AGENDA_ANY_ERA",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_DEMAGOGUE",
  "gameLimit": -1,
  "tag": "AGENDA_LATE_ERA_ONLY",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_DESTINATION_CIV",
  "gameLimit": -1,
  "tag": "AGENDA_LATE_ERA_ONLY",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_EXPANSIONIST",
  "gameLimit": -1,
  "tag": "AGENDA_ANY_ERA",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_FLAT_EARTHER",
  "gameLimit": -1,
  "tag": "AGENDA_LATE_ERA_ONLY",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_GREAT_WHITE_FLEET",
  "gameLimit": -1,
  "tag": "AGENDA_ANY_ERA",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_INTOLERANT",
  "gameLimit": -1,
  "tag": "AGENDA_LATE_ERA_ONLY",
  "requiresReligion": true
 },
 {
  "agenda": "AGENDA_LIBERTARIAN",
  "gameLimit": -1,
  "tag": "AGENDA_LATE_ERA_ONLY",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_PILLAGER",
  "gameLimit": -1,
  "tag": "AGENDA_EARLY_ERA_ONLY",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_TURTLER",
  "gameLimit": -1,
  "tag": "AGENDA_LATE_ERA_ONLY",
  "requiresReligion": false
 },
 {
  "agenda": "AGENDA_ZEALOT",
  "gameLimit": -1,
  "tag": "AGENDA_LATE_ERA_ONLY",
  "requiresReligion": true
 }
];
export const DIPLO_RANDOM_AGENDAS_IN_ERA: readonly { era: string; n: number; tags: readonly string[] }[] = [
 {
  "era": "ERA_ANCIENT",
  "n": 1,
  "tags": [
   "AGENDA_EARLY_ERA_ONLY",
   "AGENDA_ANY_ERA"
  ]
 }
];
export const DIPLO_RANDOM_AGENDAS_FOR_CIVIC: readonly { civic: string; n: number; tags: readonly string[] }[] = [
 {
  "civic": "CIVIC_NATIONALISM",
  "n": 1,
  "tags": [
   "AGENDA_LATE_ERA_ONLY",
   "AGENDA_ANY_ERA"
  ]
 }
];
export const DIPLO_HISTORICAL_AGENDAS: Readonly<Record<string, readonly string[]>> = {
 "LEADER_BARBAROSSA": [
  "AGENDA_IRON_CROWN"
 ],
 "LEADER_CATHERINE_DE_MEDICI": [
  "AGENDA_BLACK_QUEEN"
 ],
 "LEADER_CLEOPATRA": [
  "AGENDA_QUEEN_OF_NILE"
 ],
 "LEADER_GANDHI": [
  "AGENDA_PEACEKEEPER"
 ],
 "LEADER_GILGAMESH": [
  "AGENDA_ALLY_OF_ENKIDU"
 ],
 "LEADER_GORGO": [
  "AGENDA_WITH_YOUR_SHIELD_OR_ON_IT"
 ],
 "LEADER_HARDRADA": [
  "AGENDA_LAST_VIKING_KING"
 ],
 "LEADER_HOJO": [
  "AGENDA_BUSHIDO"
 ],
 "LEADER_MVEMBA": [
  "AGENDA_ENTHUSIASTIC_DISCIPLE"
 ],
 "LEADER_PEDRO": [
  "AGENDA_GREAT_PERSON_OBSESSED"
 ],
 "LEADER_PERICLES": [
  "AGENDA_DELIAN_LEAGUE"
 ],
 "LEADER_PETER_GREAT": [
  "AGENDA_WESTERNIZER"
 ],
 "LEADER_PHILIP_II": [
  "AGENDA_COUNTER_REFORMER"
 ],
 "LEADER_QIN": [
  "AGENDA_WONDER_OBSESSED"
 ],
 "LEADER_SALADIN": [
  "AGENDA_AYYUBID_DYNASTY"
 ],
 "LEADER_TOMYRIS": [
  "AGENDA_BACKSTAB_AVERSE"
 ],
 "LEADER_TRAJAN": [
  "AGENDA_OPTIMUS_PRINCEPS"
 ],
 "LEADER_VICTORIA": [
  "AGENDA_SUN_NEVER_SETS"
 ],
 "LEADER_CHANDRAGUPTA": [
  "AGENDA_MAURYA_EMPIRE"
 ],
 "LEADER_GENGHIS_KHAN": [
  "AGENDA_HORSE_LORD"
 ],
 "LEADER_LAUTARO": [
  "AGENDA_SPIRIT_OF_TUCAPEL"
 ],
 "LEADER_POUNDMAKER": [
  "AGENDA_IRON_CONFEDERACY"
 ],
 "LEADER_ROBERT_THE_BRUCE": [
  "AGENDA_FLOWER_OF_SCOTLAND"
 ],
 "LEADER_SEONDEOK": [
  "AGENDA_CHEOMSEONGDAE"
 ],
 "LEADER_SHAKA": [
  "AGENDA_HORN_CHEST_LOINS"
 ],
 "LEADER_TAMAR": [
  "AGENDA_NARIKALA_FORTRESS"
 ],
 "LEADER_WILHELMINA": [
  "AGENDA_BILLIONAIRE"
 ],
 "LEADER_DIDO": [
  "AGENDA_SICILIAN_WARS"
 ],
 "LEADER_ELEANOR_ENGLAND": [
  "AGENDA_ANGEVIN_EMPIRE"
 ],
 "LEADER_ELEANOR_FRANCE": [
  "AGENDA_ANGEVIN_EMPIRE"
 ],
 "LEADER_KRISTINA": [
  "AGENDA_PATRON_OF_ARTS"
 ],
 "LEADER_KUPE": [
  "AGENDA_KAITIAKITANGA"
 ],
 "LEADER_LAURIER": [
  "AGENDA_CANADIAN_EXPEDITIONARY"
 ],
 "LEADER_MANSA_MUSA": [
  "AGENDA_LORD_OF_MINES"
 ],
 "LEADER_MATTHIAS_CORVINUS": [
  "AGENDA_RAVEN_BANNER"
 ],
 "LEADER_PACHACUTI": [
  "AGENDA_SAPA_INCA"
 ],
 "LEADER_SULEIMAN": [
  "AGENDA_LAWGIVER"
 ],
 "LEADER_JOHN_CURTIN": [
  "AGENDA_PERPETUALLY_ON_GUARD"
 ],
 "LEADER_MONTEZUMA": [
  "AGENDA_TLATOANI"
 ],
 "LEADER_HAMMURABI": [
  "AGENDA_HAMMURABI_DISTRICTS"
 ],
 "LEADER_BASIL": [
  "AGENDA_BASIL_ZEALOT"
 ],
 "LEADER_AMBIORIX": [
  "AGENDA_AMBIORIX_ARMY"
 ],
 "LEADER_CATHERINE_DE_MEDICI_ALT": [
  "AGENDA_MAGNIFICENCES"
 ],
 "LEADER_MENELIK": [
  "AGENDA_ETHIOPIAN_HIGHLANDS"
 ],
 "LEADER_LADY_SIX_SKY": [
  "AGENDA_LADY_SIX_SKY"
 ],
 "LEADER_SIMON_BOLIVAR": [
  "AGENDA_SIMON_BOLIVAR"
 ],
 "LEADER_LUDWIG": [
  "AGENDA_ETERNAL"
 ],
 "LEADER_THEODORA": [
  "AGENDA_NEW_ROME"
 ],
 "LEADER_SEJONG": [
  "AGENDA_SEJONG"
 ],
 "LEADER_ABRAHAM_LINCOLN": [
  "AGENDA_PRESERVER_OF_THE_UNION"
 ],
 "LEADER_SALADIN_ALT": [
  "AGENDA_SULTAN"
 ],
 "LEADER_NZINGA_MBANDE": [
  "AGENDA_DECOLONIZATION"
 ],
 "LEADER_TOKUGAWA": [
  "AGENDA_SAKOKU"
 ],
 "LEADER_NADER_SHAH": [
  "AGENDA_PREFER_LANDPOWER"
 ],
 "LEADER_SULEIMAN_ALT": [
  "AGENDA_GOLDEN_AGE"
 ],
 "LEADER_GITARJA": [
  "AGENDA_ARCHIPELAGIC_STATE"
 ],
 "LEADER_JAYAVARMAN": [
  "AGENDA_END_TO_SUFFERING"
 ],
 "LEADER_JULIUS_CAESAR": [
  "AGENDA_GALLIC_WARS"
 ],
 "LEADER_LADY_TRIEU": [
  "AGENDA_TRIEU_DEFENDER"
 ],
 "LEADER_KUBLAI_KHAN_CHINA": [
  "AGENDA_KUBLAI_PAX"
 ],
 "LEADER_KUBLAI_KHAN_MONGOLIA": [
  "AGENDA_KUBLAI_PAX"
 ],
 "LEADER_ALEXANDER": [
  "AGENDA_SHORT_LIFE_GLORY"
 ],
 "LEADER_CYRUS": [
  "AGENDA_BACKSTABBER"
 ],
 "LEADER_AMANITORE": [
  "AGENDA_CITY_PLANNER"
 ],
 "LEADER_JADWIGA": [
  "AGENDA_SAINT"
 ],
 "LEADER_JOAO_III": [
  "AGENDA_JOAO_EXPLORER"
 ],
 "LEADER_QIN_ALT": [
  "AGENDA_SIHAI"
 ],
 "LEADER_YONGLE": [
  "AGENDA_YINDING"
 ],
 "LEADER_WU_ZETIAN": [
  "AGENDA_COURT_INTRIGUE"
 ],
 "LEADER_ELIZABETH": [
  "AGENDA_TRADE_AGREEMENT"
 ],
 "LEADER_HARALD_ALT": [
  "AGENDA_SAGA"
 ],
 "LEADER_VICTORIA_ALT": [
  "AGENDA_INDUSTRIAL_REVOLUTION"
 ],
 "LEADER_RAMSES": [
  "AGENDA_MAAT"
 ],
 "LEADER_CLEOPATRA_ALT": [
  "AGENDA_PREFER_FOOD"
 ],
 "LEADER_SUNDIATA_KEITA": [
  "AGENDA_LION_OF_MALI"
 ],
 "LEADER_T_ROOSEVELT_ROUGHRIDER": [
  "AGENDA_BIG_STICK_POLICY"
 ],
 "LEADER_T_ROOSEVELT": [
  "AGENDA_BULL_MOOSE"
 ]
};
export const DIPLO_EXCLUSIVE_AGENDAS: readonly (readonly [string, string])[] = [
 [
  "AGENDA_DELIAN_LEAGUE",
  "AGENDA_CITY_STATE_ALLY"
 ],
 [
  "AGENDA_QUEEN_OF_NILE",
  "AGENDA_STANDING_ARMY"
 ],
 [
  "AGENDA_QUEEN_OF_NILE",
  "AGENDA_PARANOID"
 ],
 [
  "AGENDA_ALLY_OF_ENKIDU",
  "AGENDA_DARWINIST"
 ],
 [
  "AGENDA_PEACEKEEPER",
  "AGENDA_DARWINIST"
 ],
 [
  "AGENDA_IRON_CROWN",
  "AGENDA_CITY_STATE_ALLY"
 ],
 [
  "AGENDA_IRON_CROWN",
  "AGENDA_CITY_STATE_PROTECTOR"
 ],
 [
  "AGENDA_LAST_VIKING_KING",
  "AGENDA_PARANOID"
 ],
 [
  "AGENDA_GREAT_PERSON_OBSESSED",
  "AGENDA_GREAT_PERSON_ADVOCATE"
 ],
 [
  "AGENDA_WONDER_OBSESSED",
  "AGENDA_WONDER_ADVOCATE"
 ],
 [
  "AGENDA_BIG_STICK_POLICY",
  "AGENDA_DARWINIST"
 ],
 [
  "AGENDA_BIG_STICK_POLICY",
  "AGENDA_EXPLOITATIVE"
 ],
 [
  "AGENDA_BUSHIDO",
  "AGENDA_CULTURED"
 ],
 [
  "AGENDA_BUSHIDO",
  "AGENDA_STANDING_ARMY"
 ],
 [
  "AGENDA_BUSHIDO",
  "AGENDA_DEVOUT"
 ],
 [
  "AGENDA_BUSHIDO",
  "AGENDA_PARANOID"
 ],
 [
  "AGENDA_WESTERNIZER",
  "AGENDA_CULTURED"
 ],
 [
  "AGENDA_WESTERNIZER",
  "AGENDA_TECHNOPHILE"
 ],
 [
  "AGENDA_ENTHUSIASTIC_DISCIPLE",
  "AGENDA_DEVOUT"
 ],
 [
  "AGENDA_CHEOMSEONGDAE",
  "AGENDA_TECHNOPHILE"
 ],
 [
  "AGENDA_HORN_CHEST_LOINS",
  "AGENDA_PARANOID"
 ],
 [
  "AGENDA_HORSE_LORD",
  "AGENDA_PARANOID"
 ],
 [
  "AGENDA_BLACK_QUEEN",
  "AGENDA_GOSSIP"
 ],
 [
  "AGENDA_CHEOMSEONGDAE",
  "AGENDA_FLAT_EARTHER"
 ],
 [
  "AGENDA_OPTIMUS_PRINCEPS",
  "AGENDA_EXPANSIONIST"
 ],
 [
  "AGENDA_LAST_VIKING_KING",
  "AGENDA_GREAT_WHITE_FLEET"
 ],
 [
  "AGENDA_PARANOID",
  "AGENDA_GREAT_WHITE_FLEET"
 ],
 [
  "AGENDA_COUNTER_REFORMER",
  "AGENDA_INTOLERANT"
 ],
 [
  "AGENDA_SYCOPHANT",
  "AGENDA_SYMPATHIZER"
 ],
 [
  "AGENDA_ENVIRONMENTALIST",
  "AGENDA_EXPLOITATIVE"
 ],
 [
  "AGENDA_ENTHUSIASTIC_DISCIPLE",
  "AGENDA_INTOLERANT"
 ],
 [
  "AGENDA_ANGEVIN_EMPIRE",
  "AGENDA_POPULOUS"
 ],
 [
  "AGENDA_CANADIAN_EXPEDITIONARY",
  "AGENDA_EXPLOITATIVE"
 ],
 [
  "AGENDA_KAITIAKITANGA",
  "AGENDA_ENVIRONMENTALIST"
 ],
 [
  "AGENDA_KAITIAKITANGA",
  "AGENDA_EXPLOITATIVE"
 ],
 [
  "AGENDA_KAITIAKITANGA",
  "AGENDA_INDUSTRIALIST"
 ],
 [
  "AGENDA_LAWGIVER",
  "AGENDA_FUN_LOVING"
 ],
 [
  "AGENDA_LORD_OF_MINES",
  "AGENDA_MONEY_GRUBBER"
 ],
 [
  "AGENDA_PERPETUALLY_ON_GUARD",
  "AGENDA_DARWINIST"
 ],
 [
  "AGENDA_AMBIORIX_ARMY",
  "AGENDA_STANDING_ARMY"
 ],
 [
  "AGENDA_BASIL_ZEALOT",
  "AGENDA_ZEALOT"
 ],
 [
  "AGENDA_LADY_SIX_SKY",
  "AGENDA_PARANOID"
 ],
 [
  "AGENDA_LADY_SIX_SKY",
  "AGENDA_EXPANSIONIST"
 ],
 [
  "AGENDA_NEW_ROME",
  "AGENDA_CULTURED"
 ],
 [
  "AGENDA_SEJONG",
  "AGENDA_CULTURED"
 ],
 [
  "AGENDA_SEJONG",
  "AGENDA_TECHNOPHILE"
 ],
 [
  "AGENDA_PRESERVER_OF_THE_UNION",
  "AGENDA_IDEOLOGUE"
 ],
 [
  "AGENDA_PREFER_LANDPOWER",
  "AGENDA_AIRPOWER"
 ],
 [
  "AGENDA_PREFER_LANDPOWER",
  "AGENDA_STANDING_ARMY"
 ],
 [
  "AGENDA_SAKOKU",
  "AGENDA_TURTLER"
 ],
 [
  "AGENDA_GOLDEN_AGE",
  "AGENDA_SYCOPHANT"
 ],
 [
  "AGENDA_GOLDEN_AGE",
  "AGENDA_SYMPATHIZER"
 ],
 [
  "AGENDA_PREFER_LANDPOWER",
  "AGENDA_GREAT_WHITE_FLEET"
 ],
 [
  "AGENDA_GALLIC_WARS",
  "AGENDA_BARBARIAN_LOVER"
 ],
 [
  "AGENDA_GALLIC_WARS",
  "AGENDA_CIVILIZED"
 ],
 [
  "AGENDA_SHORT_LIFE_GLORY",
  "AGENDA_PARANOID"
 ],
 [
  "AGENDA_SHORT_LIFE_GLORY",
  "AGENDA_CITY_STATE_PROTECTOR"
 ],
 [
  "AGENDA_SHORT_LIFE_GLORY",
  "AGENDA_DARWINIST"
 ],
 [
  "AGENDA_BACKSTABBER",
  "AGENDA_CITY_STATE_PROTECTOR"
 ],
 [
  "AGENDA_SHORT_LIFE_GLORY",
  "AGENDA_TURTLER"
 ],
 [
  "AGENDA_SAINT",
  "AGENDA_DEVOUT"
 ],
 [
  "AGENDA_JOAO_EXPLORER",
  "AGENDA_EXPLORER"
 ],
 [
  "AGENDA_SIHAI",
  "AGENDA_CIVILIZED"
 ],
 [
  "AGENDA_SIHAI",
  "AGENDA_BARBARIAN_LOVER"
 ],
 [
  "AGENDA_YINDING",
  "AGENDA_MONEY_GRUBBER"
 ],
 [
  "AGENDA_COURT_INTRIGUE",
  "AGENDA_PARANOID"
 ],
 [
  "AGENDA_SAGA",
  "AGENDA_CITY_STATE_PROTECTOR"
 ],
 [
  "AGENDA_INDUSTRIAL_REVOLUTION",
  "AGENDA_ENVIRONMENTALIST"
 ],
 [
  "AGENDA_INDUSTRIAL_REVOLUTION",
  "AGENDA_INDUSTRIALIST"
 ],
 [
  "AGENDA_MAAT",
  "AGENDA_EXPLOITATIVE"
 ],
 [
  "AGENDA_ENVIRONMENTALIST",
  "AGENDA_MAAT"
 ],
 [
  "AGENDA_DESTINATION_CIV",
  "AGENDA_LION_OF_MALI"
 ],
 [
  "AGENDA_BULL_MOOSE",
  "AGENDA_NATURALIST"
 ],
 [
  "AGENDA_BULL_MOOSE",
  "AGENDA_DARWINIST"
 ],
 [
  "AGENDA_BULL_MOOSE",
  "AGENDA_EXPLOITATIVE"
 ]
];
export const DIPLO_PREFERRED_AGENDAS: readonly { agenda: string; leader: string; pct: number }[] = [
 {
  "agenda": "AGENDA_NUKE_LOVER",
  "leader": "LEADER_GANDHI",
  "pct": 70
 },
 {
  "agenda": "AGENDA_POPULOUS",
  "leader": "LEADER_GANDHI",
  "pct": 20
 },
 {
  "agenda": "AGENDA_ENVIRONMENTALIST",
  "leader": "LEADER_T_ROOSEVELT",
  "pct": 33
 },
 {
  "agenda": "AGENDA_SYMPATHIZER",
  "leader": "LEADER_LAUTARO",
  "pct": 10
 },
 {
  "agenda": "AGENDA_SYMPATHIZER",
  "leader": "LEADER_GENGHIS_KHAN",
  "pct": 10
 },
 {
  "agenda": "AGENDA_GOSSIP",
  "leader": "LEADER_CATHERINE_DE_MEDICI",
  "pct": 15
 },
 {
  "agenda": "AGENDA_SYCOPHANT",
  "leader": "LEADER_GORGO",
  "pct": 10
 },
 {
  "agenda": "AGENDA_SYCOPHANT",
  "leader": "LEADER_PHILIP_II",
  "pct": 10
 },
 {
  "agenda": "AGENDA_SYCOPHANT",
  "leader": "LEADER_PETER_GREAT",
  "pct": 10
 },
 {
  "agenda": "AGENDA_GREAT_PERSON_ADVOCATE",
  "leader": "LEADER_KRISTINA",
  "pct": 20
 },
 {
  "agenda": "AGENDA_WONDER_ADVOCATE",
  "leader": "LEADER_LUDWIG",
  "pct": 33
 },
 {
  "agenda": "AGENDA_SYMPATHIZER",
  "leader": "LEADER_JAYAVARMAN",
  "pct": 10
 },
 {
  "agenda": "AGENDA_SYMPATHIZER",
  "leader": "LEADER_JAYAVARMAN",
  "pct": 10
 },
 {
  "agenda": "AGENDA_SYMPATHIZER",
  "leader": "LEADER_JADWIGA",
  "pct": 10
 },
 {
  "agenda": "AGENDA_SYMPATHIZER",
  "leader": "LEADER_JADWIGA",
  "pct": 10
 }
];
export const DIPLO_STATES: readonly { type: string; yieldBonus: number; level: number }[] = [
 {
  "type": "DIPLO_STATE_ALLIED",
  "yieldBonus": 50,
  "level": 100
 },
 {
  "type": "DIPLO_STATE_DECLARED_FRIEND",
  "yieldBonus": 25,
  "level": 83
 },
 {
  "type": "DIPLO_STATE_FRIENDLY",
  "yieldBonus": 25,
  "level": 66
 },
 {
  "type": "DIPLO_STATE_NEUTRAL",
  "yieldBonus": 0,
  "level": 50
 },
 {
  "type": "DIPLO_STATE_UNFRIENDLY",
  "yieldBonus": -25,
  "level": 33
 },
 {
  "type": "DIPLO_STATE_DENOUNCED",
  "yieldBonus": -75,
  "level": 16
 },
 {
  "type": "DIPLO_STATE_WAR",
  "yieldBonus": -100,
  "level": 0
 },
 {
  "type": "DIPLO_STATE_NO_INFLUENCE",
  "yieldBonus": 0,
  "level": 0
 },
 {
  "type": "DIPLO_STATE_INFLUENTIAL",
  "yieldBonus": 0,
  "level": 0
 },
 {
  "type": "DIPLO_STATE_MAX_INFLUENCE",
  "yieldBonus": 0,
  "level": 0
 },
 {
  "type": "DIPLO_STATE_WAR_WITH_MINOR",
  "yieldBonus": 0,
  "level": 0
 },
 {
  "type": "DIPLO_STATE_AWARE",
  "yieldBonus": 0,
  "level": 0
 },
 {
  "type": "DIPLO_STATE_PATRON",
  "yieldBonus": 0,
  "level": 0
 },
 {
  "type": "DIPLO_STATE_PROTECTOR",
  "yieldBonus": 0,
  "level": 0
 },
 {
  "type": "DIPLO_STATE_WAR_WITH_MAJOR",
  "yieldBonus": 0,
  "level": 0
 },
 {
  "type": "DIPLO_STATE_MINOR_MINOR",
  "yieldBonus": 0,
  "level": 0
 },
 {
  "type": "DIPLO_STATE_MINOR_MINOR_WAR",
  "yieldBonus": 0,
  "level": 0
 },
 {
  "type": "DIPLO_STATE_FREE_CITIES_NEUTRAL",
  "yieldBonus": 0,
  "level": 0
 }
];
export const DIPLO_TRANSITIONS: readonly { from: string; to: string; allowMin: number | null; allowMax: number | null; requireMin: number | null; requireMax: number | null; check: string | null; action: string | null }[] = [
 {
  "from": "DIPLO_STATE_FRIENDLY",
  "to": "DIPLO_STATE_DECLARED_FRIEND",
  "allowMin": 5,
  "allowMax": null,
  "requireMin": null,
  "requireMax": 25,
  "check": "CanDeclareFriendship",
  "action": "OnDeclareFriendship"
 },
 {
  "from": "DIPLO_STATE_FRIENDLY",
  "to": "DIPLO_STATE_NEUTRAL",
  "allowMin": null,
  "allowMax": 15,
  "requireMin": -5,
  "requireMax": null,
  "check": null,
  "action": null
 },
 {
  "from": "DIPLO_STATE_NEUTRAL",
  "to": "DIPLO_STATE_FRIENDLY",
  "allowMin": -5,
  "allowMax": null,
  "requireMin": null,
  "requireMax": 15,
  "check": null,
  "action": null
 },
 {
  "from": "DIPLO_STATE_NEUTRAL",
  "to": "DIPLO_STATE_UNFRIENDLY",
  "allowMin": null,
  "allowMax": 5,
  "requireMin": -15,
  "requireMax": null,
  "check": null,
  "action": null
 },
 {
  "from": "DIPLO_STATE_UNFRIENDLY",
  "to": "DIPLO_STATE_NEUTRAL",
  "allowMin": -15,
  "allowMax": null,
  "requireMin": null,
  "requireMax": 5,
  "check": null,
  "action": null
 },
 {
  "from": "DIPLO_STATE_UNFRIENDLY",
  "to": "DIPLO_STATE_DENOUNCED",
  "allowMin": null,
  "allowMax": -5,
  "requireMin": -25,
  "requireMax": null,
  "check": "CanDenounce",
  "action": "OnDenouncePlayer"
 },
 {
  "from": "DIPLO_STATE_DENOUNCED",
  "to": "DIPLO_STATE_WAR",
  "allowMin": null,
  "allowMax": null,
  "requireMin": -35,
  "requireMax": null,
  "check": "CanGoToWar",
  "action": "GoToWar"
 },
 {
  "from": "DIPLO_STATE_NO_INFLUENCE",
  "to": "DIPLO_STATE_INFLUENTIAL",
  "allowMin": null,
  "allowMax": null,
  "requireMin": null,
  "requireMax": 1,
  "check": null,
  "action": null
 },
 {
  "from": "DIPLO_STATE_NO_INFLUENCE",
  "to": "DIPLO_STATE_MAX_INFLUENCE",
  "allowMin": null,
  "allowMax": null,
  "requireMin": null,
  "requireMax": 1,
  "check": "HasMaxInfluence",
  "action": null
 },
 {
  "from": "DIPLO_STATE_INFLUENTIAL",
  "to": "DIPLO_STATE_NO_INFLUENCE",
  "allowMin": null,
  "allowMax": null,
  "requireMin": 0,
  "requireMax": null,
  "check": null,
  "action": null
 },
 {
  "from": "DIPLO_STATE_INFLUENTIAL",
  "to": "DIPLO_STATE_MAX_INFLUENCE",
  "allowMin": null,
  "allowMax": null,
  "requireMin": null,
  "requireMax": null,
  "check": "HasMaxInfluence",
  "action": null
 },
 {
  "from": "DIPLO_STATE_MAX_INFLUENCE",
  "to": "DIPLO_STATE_NO_INFLUENCE",
  "allowMin": null,
  "allowMax": null,
  "requireMin": 0,
  "requireMax": null,
  "check": null,
  "action": null
 },
 {
  "from": "DIPLO_STATE_MAX_INFLUENCE",
  "to": "DIPLO_STATE_INFLUENTIAL",
  "allowMin": null,
  "allowMax": null,
  "requireMin": null,
  "requireMax": null,
  "check": "NotMaxInfluence",
  "action": null
 },
 {
  "from": "DIPLO_STATE_AWARE",
  "to": "DIPLO_STATE_PATRON",
  "allowMin": null,
  "allowMax": null,
  "requireMin": null,
  "requireMax": 1,
  "check": null,
  "action": null
 },
 {
  "from": "DIPLO_STATE_AWARE",
  "to": "DIPLO_STATE_PATRON",
  "allowMin": null,
  "allowMax": null,
  "requireMin": null,
  "requireMax": 1,
  "check": "HasMaxInfluence",
  "action": null
 },
 {
  "from": "DIPLO_STATE_PATRON",
  "to": "DIPLO_STATE_AWARE",
  "allowMin": null,
  "allowMax": null,
  "requireMin": 0,
  "requireMax": null,
  "check": null,
  "action": null
 },
 {
  "from": "DIPLO_STATE_PATRON",
  "to": "DIPLO_STATE_PROTECTOR",
  "allowMin": null,
  "allowMax": null,
  "requireMin": null,
  "requireMax": null,
  "check": "HasMaxInfluence",
  "action": null
 },
 {
  "from": "DIPLO_STATE_PROTECTOR",
  "to": "DIPLO_STATE_AWARE",
  "allowMin": null,
  "allowMax": null,
  "requireMin": 0,
  "requireMax": null,
  "check": null,
  "action": null
 },
 {
  "from": "DIPLO_STATE_PROTECTOR",
  "to": "DIPLO_STATE_PATRON",
  "allowMin": null,
  "allowMax": null,
  "requireMin": null,
  "requireMax": null,
  "check": "NotMaxInfluence",
  "action": null
 },
 {
  "from": "DIPLO_STATE_DECLARED_FRIEND",
  "to": "DIPLO_STATE_ALLIED",
  "allowMin": 15,
  "allowMax": null,
  "requireMin": null,
  "requireMax": 35,
  "check": "CanOfferAlliance",
  "action": "OnOfferAlliance"
 }
];
export const DIPLO_STATE_ACTIONS: readonly { state: string; action: string; worth: number; cost: number; aiAllowed: boolean; to: string | null }[] = [
 {
  "state": "DIPLO_STATE_ALLIED",
  "action": "DIPLOACTION_RESIDENT_EMBASSY",
  "worth": 75,
  "cost": -10,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_ALLIED",
  "action": "DIPLOACTION_OPEN_BORDERS",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_ALLIED",
  "action": "DIPLOACTION_REQUEST_ASSISTANCE",
  "worth": -50,
  "cost": 70,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_ALLIED",
  "action": "DIPLOACTION_DIPLOMATIC_DELEGATION",
  "worth": 40,
  "cost": -10,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_ALLIED",
  "action": "DIPLOACTION_DECLARE_FRIENDSHIP",
  "worth": 35,
  "cost": -25,
  "aiAllowed": false,
  "to": null
 },
 {
  "state": "DIPLO_STATE_ALLIED",
  "action": "DIPLOACTION_PROPOSE_TRADE",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_ALLIED",
  "action": "DIPLOACTION_JOINT_WAR",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_ALLIED",
  "action": "DIPLOACTION_KEEP_PROMISE_DONT_SPY",
  "worth": 0,
  "cost": -30,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_ALLIED",
  "action": "DIPLOACTION_KEEP_PROMISE_DONT_CONVERT",
  "worth": 0,
  "cost": -5,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_ALLIED",
  "action": "DIPLOACTION_KEEP_PROMISE_DONT_DIG_ARTIFACTS",
  "worth": 0,
  "cost": -10,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_ALLIED",
  "action": "DIPLOACTION_KEEP_PROMISE_DONT_SETTLE_TOO_NEAR",
  "worth": 0,
  "cost": -50,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_DECLARED_FRIEND",
  "action": "DIPLOACTION_ALLIANCE",
  "worth": -10,
  "cost": -10,
  "aiAllowed": true,
  "to": "DIPLO_STATE_ALLIED"
 },
 {
  "state": "DIPLO_STATE_DECLARED_FRIEND",
  "action": "DIPLOACTION_RESIDENT_EMBASSY",
  "worth": 75,
  "cost": -10,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_DECLARED_FRIEND",
  "action": "DIPLOACTION_OPEN_BORDERS",
  "worth": 20,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_DECLARED_FRIEND",
  "action": "DIPLOACTION_REQUEST_ASSISTANCE",
  "worth": -70,
  "cost": 80,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_DECLARED_FRIEND",
  "action": "DIPLOACTION_DIPLOMATIC_DELEGATION",
  "worth": 40,
  "cost": -10,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_DECLARED_FRIEND",
  "action": "DIPLOACTION_DECLARE_FRIENDSHIP",
  "worth": 25,
  "cost": -15,
  "aiAllowed": false,
  "to": null
 },
 {
  "state": "DIPLO_STATE_DECLARED_FRIEND",
  "action": "DIPLOACTION_PROPOSE_TRADE",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_DECLARED_FRIEND",
  "action": "DIPLOACTION_JOINT_WAR",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_DECLARED_FRIEND",
  "action": "DIPLOACTION_KEEP_PROMISE_DONT_SPY",
  "worth": 0,
  "cost": -30,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_DECLARED_FRIEND",
  "action": "DIPLOACTION_KEEP_PROMISE_DONT_CONVERT",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_DECLARED_FRIEND",
  "action": "DIPLOACTION_KEEP_PROMISE_DONT_DIG_ARTIFACTS",
  "worth": 0,
  "cost": -5,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_DECLARED_FRIEND",
  "action": "DIPLOACTION_KEEP_PROMISE_DONT_SETTLE_TOO_NEAR",
  "worth": 0,
  "cost": -30,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_FRIENDLY",
  "action": "DIPLOACTION_RESIDENT_EMBASSY",
  "worth": 50,
  "cost": 10,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_FRIENDLY",
  "action": "DIPLOACTION_DEMAND_TRIBUTE",
  "worth": 0,
  "cost": 0,
  "aiAllowed": false,
  "to": null
 },
 {
  "state": "DIPLO_STATE_FRIENDLY",
  "action": "DIPLOACTION_OPEN_BORDERS",
  "worth": 10,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_FRIENDLY",
  "action": "DIPLOACTION_REQUEST_ASSISTANCE",
  "worth": -90,
  "cost": 90,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_FRIENDLY",
  "action": "DIPLOACTION_DECLARE_SURPRISE_WAR",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_FRIENDLY",
  "action": "DIPLOACTION_DIPLOMATIC_DELEGATION",
  "worth": 25,
  "cost": 5,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_FRIENDLY",
  "action": "DIPLOACTION_DECLARE_FRIENDSHIP",
  "worth": 15,
  "cost": -15,
  "aiAllowed": false,
  "to": null
 },
 {
  "state": "DIPLO_STATE_FRIENDLY",
  "action": "DIPLOACTION_DENOUNCE",
  "worth": 0,
  "cost": 0,
  "aiAllowed": false,
  "to": null
 },
 {
  "state": "DIPLO_STATE_FRIENDLY",
  "action": "DIPLOACTION_PROPOSE_TRADE",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_FRIENDLY",
  "action": "DIPLOACTION_JOINT_WAR",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_FRIENDLY",
  "action": "DIPLOACTION_KEEP_PROMISE_DONT_SPY",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_FRIENDLY",
  "action": "DIPLOACTION_KEEP_PROMISE_DONT_CONVERT",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_FRIENDLY",
  "action": "DIPLOACTION_KEEP_PROMISE_DONT_DIG_ARTIFACTS",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_FRIENDLY",
  "action": "DIPLOACTION_KEEP_PROMISE_DONT_SETTLE_TOO_NEAR",
  "worth": 0,
  "cost": -10,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_NEUTRAL",
  "action": "DIPLOACTION_RESIDENT_EMBASSY",
  "worth": 25,
  "cost": 15,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_NEUTRAL",
  "action": "DIPLOACTION_DEMAND_TRIBUTE",
  "worth": 0,
  "cost": 0,
  "aiAllowed": false,
  "to": null
 },
 {
  "state": "DIPLO_STATE_NEUTRAL",
  "action": "DIPLOACTION_OPEN_BORDERS",
  "worth": 0,
  "cost": 10,
  "aiAllowed": false,
  "to": null
 },
 {
  "state": "DIPLO_STATE_NEUTRAL",
  "action": "DIPLOACTION_DECLARE_SURPRISE_WAR",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_NEUTRAL",
  "action": "DIPLOACTION_DIPLOMATIC_DELEGATION",
  "worth": 15,
  "cost": 10,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_NEUTRAL",
  "action": "DIPLOACTION_DECLARE_FRIENDSHIP",
  "worth": -10,
  "cost": 10,
  "aiAllowed": false,
  "to": null
 },
 {
  "state": "DIPLO_STATE_NEUTRAL",
  "action": "DIPLOACTION_DENOUNCE",
  "worth": 0,
  "cost": 0,
  "aiAllowed": false,
  "to": null
 },
 {
  "state": "DIPLO_STATE_NEUTRAL",
  "action": "DIPLOACTION_PROPOSE_TRADE",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_NEUTRAL",
  "action": "DIPLOACTION_JOINT_WAR",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_NEUTRAL",
  "action": "DIPLOACTION_KEEP_PROMISE_DONT_SPY",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_NEUTRAL",
  "action": "DIPLOACTION_KEEP_PROMISE_DONT_CONVERT",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_NEUTRAL",
  "action": "DIPLOACTION_KEEP_PROMISE_DONT_DIG_ARTIFACTS",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_NEUTRAL",
  "action": "DIPLOACTION_KEEP_PROMISE_DONT_SETTLE_TOO_NEAR",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_UNFRIENDLY",
  "action": "DIPLOACTION_RESIDENT_EMBASSY",
  "worth": 0,
  "cost": 100,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_UNFRIENDLY",
  "action": "DIPLOACTION_DEMAND_TRIBUTE",
  "worth": 5,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_UNFRIENDLY",
  "action": "DIPLOACTION_DECLARE_SURPRISE_WAR",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_UNFRIENDLY",
  "action": "DIPLOACTION_DIPLOMATIC_DELEGATION",
  "worth": 0,
  "cost": 75,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_UNFRIENDLY",
  "action": "DIPLOACTION_DECLARE_FRIENDSHIP",
  "worth": -40,
  "cost": 40,
  "aiAllowed": false,
  "to": null
 },
 {
  "state": "DIPLO_STATE_UNFRIENDLY",
  "action": "DIPLOACTION_DENOUNCE",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": "DIPLO_STATE_DENOUNCED"
 },
 {
  "state": "DIPLO_STATE_UNFRIENDLY",
  "action": "DIPLOACTION_OPEN_BORDERS",
  "worth": 0,
  "cost": 10,
  "aiAllowed": false,
  "to": null
 },
 {
  "state": "DIPLO_STATE_UNFRIENDLY",
  "action": "DIPLOACTION_PROPOSE_TRADE",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_UNFRIENDLY",
  "action": "DIPLOACTION_JOINT_WAR",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_UNFRIENDLY",
  "action": "DIPLOACTION_KEEP_PROMISE_DONT_SPY",
  "worth": 0,
  "cost": 5,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_UNFRIENDLY",
  "action": "DIPLOACTION_KEEP_PROMISE_DONT_CONVERT",
  "worth": 0,
  "cost": 5,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_UNFRIENDLY",
  "action": "DIPLOACTION_KEEP_PROMISE_DONT_DIG_ARTIFACTS",
  "worth": 0,
  "cost": 5,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_UNFRIENDLY",
  "action": "DIPLOACTION_KEEP_PROMISE_DONT_SETTLE_TOO_NEAR",
  "worth": 0,
  "cost": 10,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_DENOUNCED",
  "action": "DIPLOACTION_DEMAND_TRIBUTE",
  "worth": 30,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_DENOUNCED",
  "action": "DIPLOACTION_PROPOSE_TRADE",
  "worth": -50,
  "cost": 100,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_DENOUNCED",
  "action": "DIPLOACTION_DECLARE_SURPRISE_WAR",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_DENOUNCED",
  "action": "DIPLOACTION_DECLARE_FORMAL_WAR",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_DENOUNCED",
  "action": "DIPLOACTION_DECLARE_HOLY_WAR",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_DENOUNCED",
  "action": "DIPLOACTION_DECLARE_LIBERATION_WAR",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_DENOUNCED",
  "action": "DIPLOACTION_DECLARE_RECONQUEST_WAR",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_DENOUNCED",
  "action": "DIPLOACTION_DECLARE_PROTECTORATE_WAR",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_DENOUNCED",
  "action": "DIPLOACTION_DECLARE_COLONIAL_WAR",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_DENOUNCED",
  "action": "DIPLOACTION_DECLARE_TERRITORIAL_WAR",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_DENOUNCED",
  "action": "DIPLOACTION_KEEP_PROMISE_DONT_SPY",
  "worth": 0,
  "cost": 20,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_DENOUNCED",
  "action": "DIPLOACTION_KEEP_PROMISE_DONT_CONVERT",
  "worth": 0,
  "cost": 20,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_DENOUNCED",
  "action": "DIPLOACTION_KEEP_PROMISE_DONT_DIG_ARTIFACTS",
  "worth": 0,
  "cost": 20,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_DENOUNCED",
  "action": "DIPLOACTION_KEEP_PROMISE_DONT_SETTLE_TOO_NEAR",
  "worth": 0,
  "cost": 50,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_WAR",
  "action": "DIPLOACTION_MAKE_PEACE",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_WAR",
  "action": "DIPLOACTION_PROPOSE_PEACE_DEAL",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_NO_INFLUENCE",
  "action": "DIPLOACTION_GRANT_INFLUENCE_TOKEN",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_NO_INFLUENCE",
  "action": "DIPLOACTION_DECLARE_WAR_MINOR_CIV",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_INFLUENTIAL",
  "action": "DIPLOACTION_GRANT_INFLUENCE_TOKEN",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_INFLUENTIAL",
  "action": "DIPLOACTION_DECLARE_WAR_MINOR_CIV",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_INFLUENTIAL",
  "action": "DIPLOACTION_GIFT_UNIT",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_MAX_INFLUENCE",
  "action": "DIPLOACTION_GRANT_INFLUENCE_TOKEN",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_MAX_INFLUENCE",
  "action": "DIPLOACTION_DECLARE_WAR_MINOR_CIV",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_MAX_INFLUENCE",
  "action": "DIPLOACTION_GIFT_UNIT",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_MAX_INFLUENCE",
  "action": "DIPLOACTION_MILITARY_REQUEST",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_WAR_WITH_MINOR",
  "action": "DIPLOACTION_MAKE_PEACE",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_WAR_WITH_MINOR",
  "action": "DIPLOACTION_GRANT_INFLUENCE_TOKEN",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_DECLARED_FRIEND",
  "action": "DIPLOACTION_ALLIANCE_RESEARCH",
  "worth": 25,
  "cost": 50,
  "aiAllowed": true,
  "to": "DIPLO_STATE_ALLIED"
 },
 {
  "state": "DIPLO_STATE_DECLARED_FRIEND",
  "action": "DIPLOACTION_ALLIANCE_ECONOMIC",
  "worth": 25,
  "cost": 50,
  "aiAllowed": true,
  "to": "DIPLO_STATE_ALLIED"
 },
 {
  "state": "DIPLO_STATE_DECLARED_FRIEND",
  "action": "DIPLOACTION_ALLIANCE_MILITARY",
  "worth": 25,
  "cost": 50,
  "aiAllowed": true,
  "to": "DIPLO_STATE_ALLIED"
 },
 {
  "state": "DIPLO_STATE_DECLARED_FRIEND",
  "action": "DIPLOACTION_ALLIANCE_RELIGIOUS",
  "worth": 25,
  "cost": 50,
  "aiAllowed": true,
  "to": "DIPLO_STATE_ALLIED"
 },
 {
  "state": "DIPLO_STATE_DECLARED_FRIEND",
  "action": "DIPLOACTION_ALLIANCE_CULTURAL",
  "worth": 25,
  "cost": 50,
  "aiAllowed": true,
  "to": "DIPLO_STATE_ALLIED"
 },
 {
  "state": "DIPLO_STATE_ALLIED",
  "action": "DIPLOACTION_ALLIANCE_RESEARCH",
  "worth": 25,
  "cost": 50,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_ALLIED",
  "action": "DIPLOACTION_ALLIANCE_ECONOMIC",
  "worth": 25,
  "cost": 50,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_ALLIED",
  "action": "DIPLOACTION_ALLIANCE_MILITARY",
  "worth": 25,
  "cost": 50,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_ALLIED",
  "action": "DIPLOACTION_ALLIANCE_RELIGIOUS",
  "worth": 25,
  "cost": 50,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_ALLIED",
  "action": "DIPLOACTION_ALLIANCE_CULTURAL",
  "worth": 25,
  "cost": 50,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_ALLIED",
  "action": "DIPLOACTION_RENEW_ALLIANCE",
  "worth": 25,
  "cost": 50,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_ALLIED",
  "action": "DIPLOACTION_THIRD_PARTY_WAR",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_DECLARED_FRIEND",
  "action": "DIPLOACTION_THIRD_PARTY_WAR",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_FRIENDLY",
  "action": "DIPLOACTION_THIRD_PARTY_WAR",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_NEUTRAL",
  "action": "DIPLOACTION_THIRD_PARTY_WAR",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_UNFRIENDLY",
  "action": "DIPLOACTION_THIRD_PARTY_WAR",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_DENOUNCED",
  "action": "DIPLOACTION_DECLARE_GOLDEN_AGE_WAR",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_DENOUNCED",
  "action": "DIPLOACTION_DECLARE_WAR_OF_RETRIBUTION",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 },
 {
  "state": "DIPLO_STATE_DENOUNCED",
  "action": "DIPLOACTION_DECLARE_IDEOLOGICAL_WAR",
  "worth": 0,
  "cost": 0,
  "aiAllowed": true,
  "to": null
 }
];
export const DIPLO_ACTIONS: readonly { type: string; cost: number; prereqCivic: string | null; obsoleteCivic: string | null; duration: number }[] = [
 {
  "type": "DIPLOACTION_RESIDENT_EMBASSY",
  "cost": 50,
  "prereqCivic": "CIVIC_DIPLOMATIC_SERVICE",
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_DEMAND_TRIBUTE",
  "cost": 0,
  "prereqCivic": null,
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_OPEN_BORDERS",
  "cost": 0,
  "prereqCivic": "CIVIC_EARLY_EMPIRE",
  "obsoleteCivic": null,
  "duration": 30
 },
 {
  "type": "DIPLOACTION_REQUEST_ASSISTANCE",
  "cost": 0,
  "prereqCivic": null,
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_DENOUNCE",
  "cost": 0,
  "prereqCivic": null,
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_MAKE_PEACE",
  "cost": 0,
  "prereqCivic": null,
  "obsoleteCivic": null,
  "duration": 10
 },
 {
  "type": "DIPLOACTION_DIPLOMATIC_DELEGATION",
  "cost": 25,
  "prereqCivic": null,
  "obsoleteCivic": "CIVIC_DIPLOMATIC_SERVICE",
  "duration": 0
 },
 {
  "type": "DIPLOACTION_ALLIANCE",
  "cost": 0,
  "prereqCivic": "CIVIC_CIVIL_SERVICE",
  "obsoleteCivic": null,
  "duration": 30
 },
 {
  "type": "DIPLOACTION_DECLARE_FRIENDSHIP",
  "cost": 0,
  "prereqCivic": null,
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_GRANT_INFLUENCE_TOKEN",
  "cost": 0,
  "prereqCivic": null,
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_GIFT_UNIT",
  "cost": 0,
  "prereqCivic": null,
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_MILITARY_REQUEST",
  "cost": 0,
  "prereqCivic": null,
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_DECLARE_WAR_MINOR_CIV",
  "cost": 0,
  "prereqCivic": null,
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_DECLARE_SURPRISE_WAR",
  "cost": 0,
  "prereqCivic": null,
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_DECLARE_FORMAL_WAR",
  "cost": 0,
  "prereqCivic": null,
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_JOINT_WAR",
  "cost": 0,
  "prereqCivic": "CIVIC_FOREIGN_TRADE",
  "obsoleteCivic": null,
  "duration": 30
 },
 {
  "type": "DIPLOACTION_DECLARE_HOLY_WAR",
  "cost": 0,
  "prereqCivic": "CIVIC_DIPLOMATIC_SERVICE",
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_DECLARE_LIBERATION_WAR",
  "cost": 0,
  "prereqCivic": "CIVIC_DIPLOMATIC_SERVICE",
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_DECLARE_RECONQUEST_WAR",
  "cost": 0,
  "prereqCivic": "CIVIC_DEFENSIVE_TACTICS",
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_DECLARE_PROTECTORATE_WAR",
  "cost": 0,
  "prereqCivic": "CIVIC_DEFENSIVE_TACTICS",
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_DECLARE_COLONIAL_WAR",
  "cost": 0,
  "prereqCivic": "CIVIC_NATIONALISM",
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_DECLARE_TERRITORIAL_WAR",
  "cost": 0,
  "prereqCivic": "CIVIC_MOBILIZATION",
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_PROPOSE_TRADE",
  "cost": 0,
  "prereqCivic": null,
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_KEEP_PROMISE_DONT_SPY",
  "cost": 0,
  "prereqCivic": null,
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_KEEP_PROMISE_DONT_CONVERT",
  "cost": 0,
  "prereqCivic": null,
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_KEEP_PROMISE_DONT_DIG_ARTIFACTS",
  "cost": 0,
  "prereqCivic": null,
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_KEEP_PROMISE_DONT_SETTLE_TOO_NEAR",
  "cost": 0,
  "prereqCivic": null,
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_PROPOSE_PEACE_DEAL",
  "cost": 0,
  "prereqCivic": null,
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_VIEW_TRADE",
  "cost": 0,
  "prereqCivic": null,
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_VIEW_DEMAND_TRIBUTE",
  "cost": 0,
  "prereqCivic": null,
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_USE_NUCLEAR_WEAPON",
  "cost": 0,
  "prereqCivic": null,
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_LIBERATE_CITY",
  "cost": 0,
  "prereqCivic": null,
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_ALLIANCE_RESEARCH",
  "cost": 0,
  "prereqCivic": "CIVIC_CIVIL_SERVICE",
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_ALLIANCE_MILITARY",
  "cost": 0,
  "prereqCivic": "CIVIC_CIVIL_SERVICE",
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_ALLIANCE_ECONOMIC",
  "cost": 0,
  "prereqCivic": "CIVIC_CIVIL_SERVICE",
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_ALLIANCE_CULTURAL",
  "cost": 0,
  "prereqCivic": "CIVIC_CIVIL_SERVICE",
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_ALLIANCE_RELIGIOUS",
  "cost": 0,
  "prereqCivic": "CIVIC_CIVIL_SERVICE",
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_RENEW_ALLIANCE",
  "cost": 0,
  "prereqCivic": "CIVIC_CIVIL_SERVICE",
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_DECLARE_GOLDEN_AGE_WAR",
  "cost": 0,
  "prereqCivic": null,
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_DECLARE_WAR_OF_RETRIBUTION",
  "cost": 0,
  "prereqCivic": "CIVIC_EARLY_EMPIRE",
  "obsoleteCivic": null,
  "duration": 30
 },
 {
  "type": "DIPLOACTION_DECLARE_IDEOLOGICAL_WAR",
  "cost": 0,
  "prereqCivic": "CIVIC_IDEOLOGY",
  "obsoleteCivic": null,
  "duration": 0
 },
 {
  "type": "DIPLOACTION_THIRD_PARTY_WAR",
  "cost": 0,
  "prereqCivic": "CIVIC_FOREIGN_TRADE",
  "obsoleteCivic": null,
  "duration": 30
 }
];
