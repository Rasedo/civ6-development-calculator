/**
 * THE CIVICS AI'S TABLES (GameCore_XP2 AI/CultureAi.cpp; the reading is
 * `tools/civ6lab/dll_readings.md` "H-1: the civics AI"). The floor its value
 * gives the policies a civic unlocks, and each leader's favored civics; the
 * horizon, the discount and the pseudo-yields are the AI's value tables
 * (`aiValue.ts`).
 */
import type { LeaderId } from './seats';
import { srcConst, xml, type Src } from './provenance';

/** The least a civic's policies add to its value (0x7a9a10: the best new
 *  policy's value over the weakest slotted one, at least 0x1400 = 20.0) —
 *  every root Civic row of AI_GovtPolicies.csv whose policies log no value
 *  scores 5 x (PV(50) - PV(n)) + 20. */
export const CIVIC_AI_POLICY_FLOOR = srcConst('civicAi.policyFloor', 20, {
  lab: 'tools/civ6lab/dll_readings.md H-1: the civics AI (0x7aacb1: mov [rbp-0x78], 0x1400; cmovge the larger)',
});

/** The leader's favored civics (AiLists System="Civics" on a trait the
 *  leader, its civilization or its agenda carries, AiFavoredItems
 *  Favored="true"; an item naming no Civics row is dropped, as the game
 *  drops it): their score after the prerequisites is taken 1.5 times
 *  (0x61ee30, the civics AI's +0x268). Each list: its name, then the engine
 *  id and the install's item. */
const FAVORED_ROWS: Readonly<Partial<Record<LeaderId, readonly (readonly [string, readonly (readonly [string, string])[]])[]>>> = {
  TRAJAN: [['TrajanCivics', [['CRAFTSMANSHIP', 'CIVIC_CRAFTSMANSHIP'], ['EARLY_EMPIRE', 'CIVIC_EARLY_EMPIRE'], ['SCORCHED_EARTH', 'CIVIC_SCORCHED_EARTH']]]],
  CLEOPATRA: [['CleopatraCivics', [['CRAFTSMANSHIP', 'CIVIC_CRAFTSMANSHIP'], ['FOREIGN_TRADE', 'CIVIC_FOREIGN_TRADE'], ['STATE_WORKFORCE', 'CIVIC_STATE_WORKFORCE'], ['NATURAL_HISTORY', 'CIVIC_NATURAL_HISTORY']]]],
  HARDRADA: [['HaraldCivics', [['MILITARY_TRAINING', 'CIVIC_MILITARY_TRAINING'], ['THEOLOGY', 'CIVIC_THEOLOGY'], ['MERCENARIES', 'CIVIC_MERCENARIES']]]],
  SALADIN: [['SaladinCivics', [['THEOLOGY', 'CIVIC_THEOLOGY'], ['REFORMED_CHURCH', 'CIVIC_REFORMED_CHURCH']]]],
  PEDRO: [['PedroCivics', [['MYSTICISM', 'CIVIC_MYSTICISM'], ['DRAMA_AND_POETRY', 'CIVIC_DRAMA_POETRY'], ['GAMES_AND_RECREATION', 'CIVIC_GAMES_RECREATION'], ['GUILDS', 'CIVIC_GUILDS'], ['HUMANISM', 'CIVIC_HUMANISM'], ['NATIONALISM', 'CIVIC_NATIONALISM'], ['OPERA_AND_BALLET', 'CIVIC_OPERA_BALLET'], ['CAPITALISM', 'CIVIC_CAPITALISM']]]],
  LAURIER: [['LaurierCivics', [['CONSERVATION', 'CIVIC_CONSERVATION'], ['COLONIALISM', 'CIVIC_COLONIALISM'], ['PROFESSIONAL_SPORTS', 'CIVIC_PROFESSIONAL_SPORTS']]]],
  QIN: [['QinCivics', [['STATE_WORKFORCE', 'CIVIC_STATE_WORKFORCE'], ['DIVINE_RIGHT', 'CIVIC_DIVINE_RIGHT'], ['CIVIL_ENGINEERING', 'CIVIC_CIVIL_ENGINEERING']]]],
  POUNDMAKER: [['PoundmakerCivics', [['CONSERVATION', 'CIVIC_CONSERVATION'], ['CIVIL_SERVICE', 'CIVIC_CIVIL_SERVICE'], ['DIPLOMATIC_SERVICE', 'CIVIC_DIPLOMATIC_SERVICE'], ['SUFFRAGE', 'CIVIC_SUFFRAGE']]]],
  VICTORIA: [['VictoriaCivics', [['EXPLORATION', 'CIVIC_EXPLORATION'], ['COLONIALISM', 'CIVIC_COLONIALISM'], ['MERCANTILISM', 'CIVIC_MERCANTILISM']]]],
  ELEANOR_ENGLAND: [['EleanorCivics', [['DRAMA_AND_POETRY', 'CIVIC_DRAMA_POETRY'], ['HUMANISM', 'CIVIC_HUMANISM']]]],
  CATHERINE_DE_MEDICI: [['CatherineCivics', [['STATE_WORKFORCE', 'CIVIC_STATE_WORKFORCE'], ['DIVINE_RIGHT', 'CIVIC_DIVINE_RIGHT'], ['HUMANISM', 'CIVIC_HUMANISM'], ['CIVIL_ENGINEERING', 'CIVIC_CIVIL_ENGINEERING']]]],
  ELEANOR_FRANCE: [['EleanorCivics', [['DRAMA_AND_POETRY', 'CIVIC_DRAMA_POETRY'], ['HUMANISM', 'CIVIC_HUMANISM']]]],
  TAMAR: [['TamarCivics', [['DEFENSIVE_TACTICS', 'CIVIC_DEFENSIVE_TACTICS'], ['DIVINE_RIGHT', 'CIVIC_DIVINE_RIGHT']]]],
  BARBAROSSA: [['BarbarossaCivics', [['CRAFTSMANSHIP', 'CIVIC_CRAFTSMANSHIP'], ['FOREIGN_TRADE', 'CIVIC_FOREIGN_TRADE'], ['STATE_WORKFORCE', 'CIVIC_STATE_WORKFORCE'], ['EARLY_EMPIRE', 'CIVIC_EARLY_EMPIRE'], ['GAMES_AND_RECREATION', 'CIVIC_GAMES_RECREATION'], ['POLITICAL_PHILOSOPHY', 'CIVIC_POLITICAL_PHILOSOPHY'], ['DRAMA_AND_POETRY', 'CIVIC_DRAMA_POETRY'], ['DEFENSIVE_TACTICS', 'CIVIC_DEFENSIVE_TACTICS'], ['RECORDED_HISTORY', 'CIVIC_RECORDED_HISTORY'], ['FEUDALISM', 'CIVIC_FEUDALISM'], ['CIVIL_SERVICE', 'CIVIC_CIVIL_SERVICE'], ['MEDIEVAL_FAIRES', 'CIVIC_MEDIEVAL_FAIRES'], ['GUILDS', 'CIVIC_GUILDS'], ['HUMANISM', 'CIVIC_HUMANISM'], ['DIPLOMATIC_SERVICE', 'CIVIC_DIPLOMATIC_SERVICE'], ['MERCANTILISM', 'CIVIC_MERCANTILISM'], ['ENLIGHTENMENT', 'CIVIC_THE_ENLIGHTENMENT'], ['CIVIL_ENGINEERING', 'CIVIC_CIVIL_ENGINEERING'], ['NATIONALISM', 'CIVIC_NATIONALISM'], ['URBANIZATION', 'CIVIC_URBANIZATION'], ['MASS_MEDIA', 'CIVIC_MASS_MEDIA'], ['MOBILIZATION', 'CIVIC_MOBILIZATION'], ['IDEOLOGY', 'CIVIC_IDEOLOGY']]]],
  GORGO: [['GreeceCivics', [['DRAMA_AND_POETRY', 'CIVIC_DRAMA_POETRY']]], ['GorgoCivics', [['MILITARY_TRAINING', 'CIVIC_MILITARY_TRAINING'], ['DIPLOMATIC_SERVICE', 'CIVIC_DIPLOMATIC_SERVICE'], ['NATIONALISM', 'CIVIC_NATIONALISM'], ['MOBILIZATION', 'CIVIC_MOBILIZATION']]]],
  PERICLES: [['GreeceCivics', [['DRAMA_AND_POETRY', 'CIVIC_DRAMA_POETRY']]], ['PericlesCivics', [['MILITARY_TRAINING', 'CIVIC_MILITARY_TRAINING'], ['POLITICAL_PHILOSOPHY', 'CIVIC_POLITICAL_PHILOSOPHY'], ['MEDIEVAL_FAIRES', 'CIVIC_MEDIEVAL_FAIRES'], ['MERCENARIES', 'CIVIC_MERCENARIES']]]],
  MATTHIAS_CORVINUS: [['MatthiasCivics', [['NATURAL_HISTORY', 'CIVIC_NATURAL_HISTORY']]]],
  PACHACUTI: [['PachacutiCivics', [['FEUDALISM', 'CIVIC_FEUDALISM'], ['FOREIGN_TRADE', 'CIVIC_FOREIGN_TRADE']]]],
  GANDHI: [['GandhiCivics', [['THEOLOGY', 'CIVIC_THEOLOGY'], ['CIVIL_SERVICE', 'CIVIC_CIVIL_SERVICE'], ['HUMANISM', 'CIVIC_HUMANISM'], ['DIPLOMATIC_SERVICE', 'CIVIC_DIPLOMATIC_SERVICE']]]],
  CHANDRAGUPTA: [['ChandraguptaCivics', [['FEUDALISM', 'CIVIC_FEUDALISM'], ['PROFESSIONAL_SPORTS', 'CIVIC_PROFESSIONAL_SPORTS'], ['MILITARY_TRAINING', 'CIVIC_MILITARY_TRAINING'], ['MILITARY_TRADITION', 'CIVIC_MILITARY_TRADITION']]]],
  HOJO: [['HoJoCivics', [['DRAMA_AND_POETRY', 'CIVIC_DRAMA_POETRY'], ['THEOLOGY', 'CIVIC_THEOLOGY'], ['HUMANISM', 'CIVIC_HUMANISM']]]],
  MVEMBA: [['MvembaCivics', [['DRAMA_AND_POETRY', 'CIVIC_DRAMA_POETRY'], ['GUILDS', 'CIVIC_GUILDS']]]],
  SEONDEOK: [['SeondeokCivics', [['FEUDALISM', 'CIVIC_FEUDALISM']]]],
  MANSA_MUSA: [['MansaMusaCivics', [['GUILDS', 'CIVIC_GUILDS']]], ['KeitaCivics', [['GUILDS', 'CIVIC_GUILDS']]]],
  KUPE: [['KupeCivics', [['DRAMA_AND_POETRY', 'CIVIC_DRAMA_POETRY'], ['CONSERVATION', 'CIVIC_CONSERVATION']]]],
  LAUTARO: [['LautaroCivics', [['CRAFTSMANSHIP', 'CIVIC_CRAFTSMANSHIP'], ['STATE_WORKFORCE', 'CIVIC_STATE_WORKFORCE'], ['REFORMED_CHURCH', 'CIVIC_REFORMED_CHURCH'], ['CLASS_STRUGGLE', 'CIVIC_CLASS_STRUGGLE']]]],
  GENGHIS_KHAN: [['GenghisCivics', [['FOREIGN_TRADE', 'CIVIC_FOREIGN_TRADE'], ['DIVINE_RIGHT', 'CIVIC_DIVINE_RIGHT']]]],
  WILHELMINA: [['WilhelminaCivics', [['GUILDS', 'CIVIC_GUILDS'], ['FOREIGN_TRADE', 'CIVIC_FOREIGN_TRADE'], ['CIVIL_ENGINEERING', 'CIVIC_CIVIL_ENGINEERING']]]],
  SULEIMAN: [['SuliemanCivics', [['MEDIEVAL_FAIRES', 'CIVIC_MEDIEVAL_FAIRES']]]],
  DIDO: [['DidoCivics', [['POLITICAL_PHILOSOPHY', 'CIVIC_POLITICAL_PHILOSOPHY']]]],
  PETER_GREAT: [['PeterCivics', [['FEUDALISM', 'CIVIC_FEUDALISM']]]],
  ROBERT_THE_BRUCE: [['RobertCivics', [['GAMES_AND_RECREATION', 'CIVIC_GAMES_RECREATION'], ['DEFENSIVE_TACTICS', 'CIVIC_DEFENSIVE_TACTICS'], ['REFORMED_CHURCH', 'CIVIC_REFORMED_CHURCH'], ['GLOBALIZATION', 'CIVIC_GLOBALIZATION']]]],
  TOMYRIS: [['TomyrisCivics', [['MILITARY_TRADITION', 'CIVIC_MILITARY_TRADITION'], ['GUILDS', 'CIVIC_GUILDS'], ['DIVINE_RIGHT', 'CIVIC_DIVINE_RIGHT'], ['CAPITALISM', 'CIVIC_CAPITALISM'], ['TOTALITARIANISM', 'CIVIC_TOTALITARIANISM']]]],
  PHILIP_II: [['PhilipCivics', [['EXPLORATION', 'CIVIC_EXPLORATION'], ['COLONIALISM', 'CIVIC_COLONIALISM'], ['CULTURAL_HERITAGE', 'CIVIC_CULTURAL_HERITAGE']]]],
  KRISTINA: [['KristinaCivics', [['NATIONALISM', 'CIVIC_NATIONALISM'], ['DIVINE_RIGHT', 'CIVIC_DIVINE_RIGHT'], ['HUMANISM', 'CIVIC_HUMANISM'], ['EXPLORATION', 'CIVIC_EXPLORATION'], ['REFORMED_CHURCH', 'CIVIC_REFORMED_CHURCH'], ['DRAMA_AND_POETRY', 'CIVIC_DRAMA_POETRY']]]],
  SHAKA: [['ShakaCivics', [['MERCENARIES', 'CIVIC_MERCENARIES'], ['NATIONALISM', 'CIVIC_NATIONALISM'], ['FEUDALISM', 'CIVIC_FEUDALISM'], ['MILITARY_TRADITION', 'CIVIC_MILITARY_TRADITION']]]],
};

export const CIVIC_AI_FAVORED: Readonly<Partial<Record<LeaderId, readonly string[]>>> = Object.fromEntries(
  Object.entries(FAVORED_ROWS).map(([leader, lists]) => {
    const items = [...new Set(lists!.flatMap(([, rows]) => rows.map(([id]) => id)))];
    return [leader, srcConst(`civicAi.favored.${leader}`, items, {
      derived: `the civics of AiFavoredItems ${lists!.map(([l]) => l).join(', ')} (Favored true), the lists AiLists binds with System Civics to a trait the leader, its civilization or its agenda carries`,
      inputs: lists!.flatMap(([list, rows]) => rows.map(([, item]): Src => xml('AiFavoredItems', `ListType=${list}&Item=${item}`, 'Favored', { expect: 'true' }))),
    })];
  }),
);
