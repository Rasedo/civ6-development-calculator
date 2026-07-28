/**
 * Eurekas (techs) and inspirations (civics): one-time 40% research boosts.
 * Conditions that our systems can observe are auto-detected each turn
 * (declarative `check`); the rest (war, trade, religion, other civs…) are
 * honest manual toggles in the research panel.
 *
 * #78 SOURCING SWEEP (2026-07-28): BOOST_FRACTION = 0.4 is VERIFIED CORRECT for
 * the Gathering Storm ruleset this repo models. Boosts gave 50% in vanilla and
 * were reduced to 40% in Rise and Fall, which GS kept — so the value is right
 * AND the reason it is 0.4 rather than 0.5 is now recorded, which matters
 * because 0.5 is the number most older guides quote.
 *
 * The individual boost CONDITION TEXTS remain a NARROWED marker: they are
 * Civ 6's where the condition survived translation and paraphrased otherwise,
 * and have not been checked line by line.
 */

import type { DistrictId, GreatPersonClass, ImprovementId } from '../core/types';

export type BoostCheck =
  | { kind: 'building'; id: string; count: number }
  | { kind: 'improvement'; id: ImprovementId; count: number; onResource?: boolean }
  | { kind: 'district'; type?: DistrictId; count: number; distinctTypes?: boolean }
  | { kind: 'cityPop'; pop: number }
  | { kind: 'totalPop'; pop: number }
  | { kind: 'coastalCity' }
  | { kind: 'tech'; id: string }
  | { kind: 'greatPeople'; count: number; class?: GreatPersonClass }
  | { kind: 'anyWonderBuilt' }
  | { kind: 'nearNaturalWonder' }
  | { kind: 'policies'; count: number }
  | { kind: 'cities'; count: number };

export interface BoostDef {
  desc: string;
  /** Auto-detected condition; absent = manual toggle only. */
  check?: BoostCheck;
}

export const BOOST_FRACTION = 0.4;

/** Keyed by tech/civic id (ids never collide between the two trees). */
export const BOOSTS: Record<string, BoostDef> = {
  // --- tech eurekas ----------------------------------------------------------
  IRRIGATION: { desc: 'Farm a resource.', check: { kind: 'improvement', id: 'FARM', count: 1, onResource: true } },
  WRITING: { desc: 'Meet another civilization. (manual)' },
  ASTROLOGY: { desc: 'Own a tile adjacent to a natural wonder.', check: { kind: 'nearNaturalWonder' } },
  SAILING: { desc: 'Found a city on the coast.', check: { kind: 'coastalCity' } },
  MASONRY: { desc: 'Build a quarry.', check: { kind: 'improvement', id: 'QUARRY', count: 1 } },
  BRONZE_WORKING: { desc: 'Kill 3 barbarians. (manual)' },
  WHEEL: { desc: 'Mine a resource.', check: { kind: 'improvement', id: 'MINE', count: 1, onResource: true } },
  CELESTIAL_NAVIGATION: { desc: 'Improve 2 sea resources.', check: { kind: 'improvement', id: 'FISHING_BOATS', count: 2 } },
  CURRENCY: { desc: 'Make a trade route. (manual)' },
  HORSEBACK_RIDING: { desc: 'Build a pasture.', check: { kind: 'improvement', id: 'PASTURE', count: 1 } },
  MATHEMATICS: { desc: 'Build 3 specialty districts.', check: { kind: 'district', count: 3 } },
  CONSTRUCTION: { desc: 'Build a Water Mill.', check: { kind: 'building', id: 'WATER_MILL', count: 1 } },
  ENGINEERING: { desc: 'Build ancient walls. (manual)' },
  APPRENTICESHIP: { desc: 'Build 3 mines.', check: { kind: 'improvement', id: 'MINE', count: 3 } },
  MILITARY_ENGINEERING: { desc: 'Build an Aqueduct.', check: { kind: 'district', type: 'AQUEDUCT', count: 1 } },
  EDUCATION: { desc: 'Earn a Great Scientist.', check: { kind: 'greatPeople', count: 1, class: 'SCIENTIST' } },
  BANKING: { desc: 'Build a Market.', check: { kind: 'building', id: 'MARKET', count: 1 } },
  MASS_PRODUCTION: { desc: 'Build a Lumber Mill.', check: { kind: 'improvement', id: 'LUMBER_MILL', count: 1 } },
  ASTRONOMY: { desc: 'Build a University.', check: { kind: 'building', id: 'UNIVERSITY', count: 1 } },
  INDUSTRIALIZATION: { desc: 'Build Workshops in 3 cities.', check: { kind: 'building', id: 'WORKSHOP', count: 3 } },
  SANITATION: { desc: 'Build 2 Neighborhoods.', check: { kind: 'district', type: 'NEIGHBORHOOD', count: 2 } },
  ECONOMICS: { desc: 'Build 2 Banks.', check: { kind: 'building', id: 'BANK', count: 2 } },
  MILITARY_SCIENCE: { desc: 'Kill a unit with a knight. (manual)' },
  ELECTRICITY: { desc: 'Build 3 privateers. (manual)' },
  RADIO: { desc: 'Build a national park. (manual)' },
  CHEMISTRY: { desc: 'Complete a research agreement. (manual)' },
  STEEL: { desc: 'Mine coal.', check: { kind: 'improvement', id: 'MINE', count: 1, onResource: true } },
  REPLACEABLE_PARTS: { desc: 'Grow a city to 15 population.', check: { kind: 'cityPop', pop: 15 } },

  // B-11 new-tech eurekas — only where the condition is expressible AND the
  // target is exported to the GPU (Campus/Harbor building tiers, districts,
  // roster improvements). Military/naval/absent-system eurekas are unboostable
  // in this model (IRON_WORKING, MACHINERY, GUNPOWDER, METAL_CASTING,
  // SQUARE_RIGGING, SIEGE_TACTICS, BALLISTICS, RIFLING, FLIGHT, COMBUSTION,
  // PLASTICS, ELECTRONICS, and every Atomic/Information/Future node) —
  // recorded in ROUND_B2_LOG.
  CARTOGRAPHY: { desc: 'Build 2 Harbors.', check: { kind: 'district', type: 'HARBOR', count: 2 } },
  PRINTING: { desc: 'Build 2 Universities.', check: { kind: 'building', id: 'UNIVERSITY', count: 2 } },
  STEAM_POWER: { desc: 'Build 2 Shipyards.', check: { kind: 'building', id: 'SHIPYARD', count: 2 } },
  REFINING: { desc: 'Build 2 Oil Wells.', check: { kind: 'improvement', id: 'OIL_WELL', count: 2 } },

  // --- civic inspirations -------------------------------------------------------
  CRAFTSMANSHIP: { desc: 'Improve 3 tiles.', check: { kind: 'improvement', id: 'FARM', count: 3 } },
  FOREIGN_TRADE: { desc: 'Discover a second continent. (manual)' },
  MILITARY_TRADITION: { desc: 'Clear a barbarian outpost. (manual)' },
  STATE_WORKFORCE: { desc: 'Build any specialty district.', check: { kind: 'district', count: 1 } },
  EARLY_EMPIRE: { desc: 'Grow your civilization to 6 population.', check: { kind: 'totalPop', pop: 6 } },
  MYSTICISM: { desc: 'Found a pantheon. (manual)' },
  GAMES_AND_RECREATION: { desc: 'Research Construction.', check: { kind: 'tech', id: 'CONSTRUCTION' } },
  POLITICAL_PHILOSOPHY: { desc: 'Meet 3 city-states. (manual)' },
  DRAMA_AND_POETRY: { desc: 'Build a world wonder.', check: { kind: 'anyWonderBuilt' } },
  THEOLOGY: { desc: 'Found a religion. (manual)' },
  RECORDED_HISTORY: { desc: 'Build 2 Campuses.', check: { kind: 'district', type: 'CAMPUS', count: 2 } },
  NAVAL_TRADITION: { desc: 'Build a Harbor.', check: { kind: 'district', type: 'HARBOR', count: 1 } },
  FEUDALISM: { desc: 'Build 6 farms.', check: { kind: 'improvement', id: 'FARM', count: 6 } },
  CIVIL_SERVICE: { desc: 'Grow a city to 10 population.', check: { kind: 'cityPop', pop: 10 } },
  GUILDS: { desc: 'Build 2 Markets.', check: { kind: 'building', id: 'MARKET', count: 2 } },
  MEDIEVAL_FAIRES: { desc: 'Run 4 policy cards.', check: { kind: 'policies', count: 4 } },
  DIVINE_RIGHT: { desc: 'Build 2 Temples.', check: { kind: 'building', id: 'TEMPLE', count: 2 } },
  EXPLORATION: { desc: 'Build 2 caravels. (manual)' },
  REFORMED_CHURCH: { desc: 'Spread your religion widely. (manual)' },
  HUMANISM: { desc: 'Earn a Great Artist.', check: { kind: 'greatPeople', count: 1, class: 'ARTIST' } },
  ENLIGHTENMENT: { desc: 'Earn 3 great people.', check: { kind: 'greatPeople', count: 3 } },
  CIVIL_ENGINEERING: { desc: 'Build 7 different specialty districts.', check: { kind: 'district', count: 7, distinctTypes: true } },
  NATIONALISM: { desc: 'Declare war using a casus belli. (manual)' },
  NATURAL_HISTORY: { desc: 'Build an Entertainment Complex.', check: { kind: 'district', type: 'ENTERTAINMENT_COMPLEX', count: 1 } },
  URBANIZATION: { desc: 'Grow a city to 15 population.', check: { kind: 'cityPop', pop: 15 } },
  MASS_MEDIA: { desc: 'Research Radio.', check: { kind: 'tech', id: 'RADIO' } },
  PROFESSIONAL_SPORTS: { desc: 'Build 3 Entertainment Complexes.', check: { kind: 'district', type: 'ENTERTAINMENT_COMPLEX', count: 3 } },
  SUFFRAGE: { desc: 'Build 4 Sewers.', check: { kind: 'building', id: 'SEWER', count: 4 } },
  CLASS_STRUGGLE: { desc: 'Build 3 Factories.', check: { kind: 'building', id: 'FACTORY', count: 3 } },
  TOTALITARIANISM: { desc: 'Build 3 Military Academies.', check: { kind: 'building', id: 'MILITARY_ACADEMY', count: 3 } },

  // B-12 new-civic inspirations — only NUCLEAR_PROGRAM has an expressible,
  // exported target (Research Lab, a Campus tier). Every other appended civic's
  // real inspiration needs an absent system (trade routes, alliances, luxuries,
  // multi-city population, wonder counts) and is uninspirable (recorded).
  NUCLEAR_PROGRAM: { desc: 'Build a Research Lab.', check: { kind: 'building', id: 'RESEARCH_LAB', count: 1 } },
};
