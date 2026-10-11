/**
 * THE RESEARCH AI'S TABLES (GameCore_XP2 AI/Research.cpp; the reading is
 * `tools/civ6lab/dll_readings.md` "H-1: the research AI"). The bias a goal
 * must beat to be dropped, the embark-everything term, and each leader's
 * favored technologies; the horizon, the discount and the pseudo-yields are
 * the AI's value tables (`aiValue.ts`).
 */
import type { LeaderId } from './seats';
import { srcConst, xml, type Src } from './provenance';

const gp = (name: string) => xml('GlobalParameters', `Name=${name}`, 'Value');

/** A goal held is dropped only for a technology scoring this much more
 *  (0x760980: GlobalParameters +0xc times 10). */
export const RESEARCH_AI_TASK_BIAS = srcConst('aiResearch.taskBias', 80, gp('AI_CURRENT_TASK_BIAS'));

/** The value an embark-everything technology adds (0x7b3e50: Technologies
 *  EmbarkAll, bit 4 of +0x70, adds 5.0). */
export const RESEARCH_AI_EMBARK_ALL = srcConst('aiResearch.embarkAll', 5, {
  lab: 'tools/civ6lab/dll_readings.md H-1: the research AI (0x7b3e50: test [row+0x70], 4; add 0x500)',
});

/** The technologies that let a unit type embark (Technologies EmbarkUnitType,
 *  the row's +0xc0): their own value adds 1.0 (0x7b3e50). */
export const RESEARCH_AI_EMBARK_UNIT: readonly string[] = srcConst('aiResearch.embarkUnit', ['SAILING', 'CELESTIAL_NAVIGATION'], {
  derived: 'the Technologies rows with an EmbarkUnitType',
  inputs: [
    xml('Technologies', 'TechnologyType=TECH_SAILING', 'EmbarkUnitType', { expect: 'UNIT_BUILDER' }),
    xml('Technologies', 'TechnologyType=TECH_CELESTIAL_NAVIGATION', 'EmbarkUnitType', { expect: 'UNIT_TRADER' }),
  ],
});

/** The leader's favored technologies (AiLists System="Technologies" on a
 *  trait the leader, its civilization or its agenda carries, AiFavoredItems
 *  Favored="true"): their score after the prerequisites is taken 1.5 times
 *  (0x7604e0, the research AI's +0x4b0). */
const FAVORED_ROWS: Readonly<Partial<Record<LeaderId, readonly [string, readonly string[]]>>> = {
  BARBAROSSA: ['BarbarossaTechs', ['APPRENTICESHIP', 'ELECTRICITY']],
  CATHERINE_DE_MEDICI: ['CatherineTechs', ['CASTLES', 'PRINTING', 'FLIGHT', 'COMPUTERS']],
  CLEOPATRA: ['CleopatraTechs', ['ANIMAL_HUSBANDRY', 'FLIGHT']],
  GANDHI: ['GandhiTechs', ['ASTROLOGY', 'IRRIGATION', 'HORSEBACK_RIDING', 'ELECTRICITY']],
  HARDRADA: ['HaraldTechs', ['SAILING', 'ASTROLOGY', 'SHIPBUILDING', 'MILITARY_TACTICS']],
  HOJO: ['HoJoTechs', ['ASTROLOGY', 'BRONZE_WORKING', 'MILITARY_TACTICS']],
  MVEMBA: ['MvembaTechs', ['IRON_WORKING', 'CURRENCY']],
  PEDRO: ['PedroTechs', ['ASTROLOGY', 'CURRENCY']],
  PERICLES: ['PericlesTechs', ['BRONZE_WORKING']],
  PETER_GREAT: ['PeterTechs', ['ANIMAL_HUSBANDRY', 'ASTROLOGY', 'MILITARY_SCIENCE']],
  PHILIP_II: ['PhilipTechs', ['ANIMAL_HUSBANDRY', 'ASTROLOGY', 'CELESTIAL_NAVIGATION', 'CARTOGRAPHY', 'GUNPOWDER']],
  QIN: ['QinTechs', ['MASONRY', 'CASTLES', 'FLIGHT']],
  SALADIN: ['SaladinTechs', ['STIRRUPS']],
  TOMYRIS: ['TomyrisTechs', ['ANIMAL_HUSBANDRY', 'HORSEBACK_RIDING']],
  TRAJAN: ['TrajanTechs', ['ANIMAL_HUSBANDRY', 'ENGINEERING', 'IRON_WORKING', 'MILITARY_ENGINEERING', 'INDUSTRIALIZATION', 'COMBUSTION']],
  VICTORIA: ['VictoriaTechs', ['CELESTIAL_NAVIGATION', 'MILITARY_SCIENCE', 'INDUSTRIALIZATION']],
  CHANDRAGUPTA: ['ChandraguptaTechs', ['SANITATION', 'HORSEBACK_RIDING', 'CONSTRUCTION']],
  LAUTARO: ['LautaroTechs', ['FLIGHT', 'GUNPOWDER']],
  SHAKA: ['ShakaTechs', ['BRONZE_WORKING', 'MILITARY_TACTICS', 'MILITARY_ENGINEERING', 'MILITARY_SCIENCE']],
  GORGO: ['GorgoTechs', ['BRONZE_WORKING']],
  GENGHIS_KHAN: ['GenghisTechs', ['STIRRUPS', 'PRINTING', 'HORSEBACK_RIDING', 'BRONZE_WORKING']],
  WILHELMINA: ['WilhelminaTechs', ['CELESTIAL_NAVIGATION', 'SQUARE_RIGGING', 'REPLACEABLE_PARTS', 'ELECTRICITY', 'MASS_PRODUCTION']],
  ROBERT_THE_BRUCE: ['RobertTechs', ['WRITING', 'APPRENTICESHIP', 'RIFLING', 'FLIGHT']],
  TAMAR: ['TamarTechs', ['MASONRY', 'CASTLES', 'SIEGE_TACTICS', 'MILITARY_TACTICS']],
  POUNDMAKER: ['PoundmakerTechs', ['POTTERY', 'ANIMAL_HUSBANDRY']],
  SEONDEOK: ['SeondeokTechs', ['WRITING', 'EDUCATION', 'MINING', 'GUNPOWDER', 'APPRENTICESHIP', 'INDUSTRIALIZATION', 'REPLACEABLE_PARTS']],
  DIDO: ['DidoTechs', ['CELESTIAL_NAVIGATION', 'SAILING', 'CONSTRUCTION']],
  KRISTINA: ['KristinaTechs', ['METAL_CASTING']],
  KUPE: ['KupeTechs', ['PLASTICS', 'CARTOGRAPHY', 'FLIGHT']],
  MANSA_MUSA: ['MansaMusaTechs', ['CURRENCY', 'STIRRUPS']],
  MATTHIAS_CORVINUS: ['MatthiasTechs', ['CASTLES', 'MILITARY_SCIENCE']],
  PACHACUTI: ['PachacutiTechs', ['ENGINEERING', 'MACHINERY']],
  SULEIMAN: ['SuliemanTechs', ['BANKING']],
};

export const RESEARCH_AI_FAVORED: Readonly<Partial<Record<LeaderId, readonly string[]>>> = Object.fromEntries(
  Object.entries(FAVORED_ROWS).map(([leader, [list, techs]]) => [leader, srcConst(`aiResearch.favored.${leader}`, techs, {
    derived: `the techs of AiFavoredItems ${list} (Favored true), the list AiLists binds with System Technologies to a trait the leader, its civilization or its agenda carries`,
    inputs: techs.map((t): Src => xml('AiFavoredItems', `ListType=${list}&Item=TECH_${t}`, 'Favored', { expect: 'true' })),
  })]),
);
