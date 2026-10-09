/**
 * THE RESEARCH AI'S TABLES (GameCore_XP2 AI/Research.cpp; the reading is
 * `tools/civ6lab/dll_readings.md` "H-1: the research AI"). Its horizon, its
 * discount, the bias a goal must beat to be dropped, the pseudo-yields its
 * value reads, and each leader's favored technologies.
 */
import type { LeaderId } from './seats';
import { srcConst, xml, type Src } from './provenance';

const gp = (name: string) => xml('GlobalParameters', `Name=${name}`, 'Value');
const py = (name: string) => xml('PseudoYields', `PseudoYieldType=${name}`, 'DefaultValue');

/** The value horizon (the GlobalAI's `m_valueHorizons`[1], [[game+0x408]+0x2f0]+4): a
 *  technology more turns away than this scores -9999, and its value is the
 *  yield it pays from the turn it lands to this one. */
export const RESEARCH_AI_HORIZON = srcConst('aiResearch.horizon', 50, {
  lab: 'tools/civ6lab/dll_readings.md H-1: the research AI — every AI_Research.csv row of the 29 duels past 50 turns scores -9999 + its prereqs, every row at 50 or fewer does not (632,528 rows, 12 exceptions are contracts and Future Tech)',
});

/** The discount the value's present value runs at, in percent per turn (the
 *  GlobalAI's +0x290, 0x200 = 2.0 in fixed point, written by its constructor 0x6db0cf). */
export const RESEARCH_AI_DISCOUNT_PCT = srcConst('aiResearch.discountPct', 2, {
  lab: 'tools/civ6lab/dll_readings.md H-1: the research AI (GlobalAI 0x6da870: mov [rdi+0x290], 0x200)',
});

/** A goal held is dropped only for a technology scoring this much more
 *  (0x760980: GlobalParameters +0xc times 10). */
export const RESEARCH_AI_TASK_BIAS = srcConst('aiResearch.taskBias', 80, gp('AI_CURRENT_TASK_BIAS'));

/** The pseudo-yields the value reads, their DefaultValue (the per-player
 *  bias over them is unread: AUDIT C-96). */
export const PSEUDOYIELD_TECHNOLOGY = srcConst('aiResearch.pyTechnology', 5, py('PSEUDOYIELD_TECHNOLOGY'));
export const PSEUDOYIELD_WONDER = srcConst('aiResearch.pyWonder', 2, py('PSEUDOYIELD_WONDER'));
export const PSEUDOYIELD_DISTRICT = srcConst('aiResearch.pyDistrict', 4, py('PSEUDOYIELD_DISTRICT'));

/** The value an embark-everything technology adds (0x7b3e50: Technologies
 *  EmbarkAll, bit 4 of +0x70, adds 5.0) and the share one unlocked building
 *  or district stands for (0.5). */
export const RESEARCH_AI_EMBARK_ALL = srcConst('aiResearch.embarkAll', 5, {
  lab: 'tools/civ6lab/dll_readings.md H-1: the research AI (0x7b3e50: test [row+0x70], 4; add 0x500)',
});
export const RESEARCH_AI_UNLOCK_SHARE = srcConst('aiResearch.unlockShare', 0.5, {
  lab: 'tools/civ6lab/dll_readings.md H-1: the research AI (0x7b3e50: the building and district loops, 0.5 at 0xd20458)',
});

/** The leader's favored technologies (AiLists System="Technologies" on the
 *  leader's trait, AiFavoredItems Favored="true"): their score after the
 *  prerequisites is taken 1.5 times (0x7604e0, the research AI's +0x4b0). */
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
    derived: `the techs of AiFavoredItems ${list} (Favored true), the list AiLists binds to the leader's trait with System Technologies`,
    inputs: techs.map((t): Src => xml('AiFavoredItems', `ListType=${list}&Item=TECH_${t}`, 'Favored', { expect: 'true' })),
  })]),
);
