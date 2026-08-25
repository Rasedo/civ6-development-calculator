
import type { DistrictId, GreatPersonClass } from '../core/types';
import { LUXURY_AMENITY_CITIES } from './constants';

export const GP_CLASS_DISTRICT: Record<GreatPersonClass, DistrictId> = {
  SCIENTIST: 'CAMPUS',
  ENGINEER: 'INDUSTRIAL_ZONE',
  MERCHANT: 'COMMERCIAL_HUB',
  PROPHET: 'HOLY_SITE',
  ARTIST: 'THEATER_SQUARE',
  ADMIRAL: 'HARBOR',
  GENERAL: 'ENCAMPMENT',
  // Writers and Musicians also earn from the Theater Square (real Civ 6
  // splits the three culture classes across the same district). Appended last
  // so PROPHET stays index 3.
  WRITER: 'THEATER_SQUARE',
  MUSICIAN: 'THEATER_SQUARE',
};

export const GP_CLASS_NAMES: Record<GreatPersonClass, string> = {
  SCIENTIST: 'Great Scientist',
  ENGINEER: 'Great Engineer',
  MERCHANT: 'Great Merchant',
  PROPHET: 'Great Prophet',
  ARTIST: 'Great Artist',
  ADMIRAL: 'Great Admiral',
  GENERAL: 'Great General',
  WRITER: 'Great Writer',
  MUSICIAN: 'Great Musician',
};

/**
 * CIV6 (Great People, "GPP cost (on Standard speed)"): Classical 60, Medieval
 * 120, Renaissance 240, Industrial 420, Modern 660, Atomic 960, Information
 * 1320. Indexed in this engine's own era space, where nobody is Ancient and
 * nobody is Future — those two ends mirror their neighbour and are unreachable.
 */
export const GP_ERA_GPP: readonly number[] = [60, 60, 120, 240, 420, 660, 960, 1320, 1320];

/**
 * CIV6: "most Great People classes' GPP cost (all but art-related People and
 * the Great Prophet) will scale up from the general era base cost".
 */
export const GP_FLAT_COST_CLASSES: ReadonlySet<GreatPersonClass> = new Set<GreatPersonClass>([
  'WRITER', 'ARTIST', 'MUSICIAN', 'PROPHET',
]);

/**
 * CIV6: "GPP cost = base cost * (1 + 0.3 * difference in era) ^ difference in
 * era", where the difference is the eras between the person and the WORLD era,
 * never negative. The page's own worked examples floor it (420 * 1.6^2 = 1075.2
 * is quoted as 1075).
 */
export function gpCost(cls: GreatPersonClass, personEra: number, worldEra: number): number {
  const base = GP_ERA_GPP[Math.min(Math.max(personEra, 0), GP_ERA_GPP.length - 1)];
  if (GP_FLAT_COST_CLASSES.has(cls)) return base;
  const d = Math.max(0, personEra - worldEra);
  return Math.floor(base * (1 + 0.3 * d) ** d);
}

/**
 * What one recruit pays out. Real Civ 6 gives every Great Person a UNIQUE
 * ability, most of which this engine has no channel for (C-21); what it models
 * instead is one lump in the class's own currency, sized by the era the person
 * belongs to. The roster below supplies the names, the classes and the eras —
 * the magnitude is this model's own.
 */
export type GpLumpKey = 'science' | 'culture' | 'faith' | 'gold' | 'productionToCapital';

export const GP_CURRENCY: Record<GreatPersonClass, GpLumpKey> = {
  SCIENTIST: 'science',
  ENGINEER: 'productionToCapital',
  MERCHANT: 'gold',
  PROPHET: 'faith',
  ARTIST: 'culture',
  ADMIRAL: 'gold',
  GENERAL: 'productionToCapital',
  WRITER: 'culture',
  MUSICIAN: 'culture',
};

export function gpEffect(cls: GreatPersonClass, era: number): GpEffect {
  const lump = GP_ERA_GPP[Math.min(Math.max(era, 0), GP_ERA_GPP.length - 1)];
  return { [GP_CURRENCY[cls]]: lump };
}

export interface GreatPersonDef {
  id: string;
  name: string;
  class: GreatPersonClass;
  /** the ERA this person belongs to, which is what orders the class's queue
   *  and what prices the recruit. */
  era: number;
  effect: GpEffect;
}

const P = (cls: GreatPersonClass, id: string, name: string, era: number): GreatPersonDef =>
  ({ id, name, class: cls, era, effect: gpEffect(cls, era) });

/**
 * CIV6 (the nine Great Person pages): every person in the game, with the ERA
 * each page's own roster column names. "All Great People of a certain class now
 * come in a queue, arranged by era. The queue starts with People from the
 * Classical Era, and finishes with those from the Information Era" — so nobody
 * here is Ancient, Artists begin in the Renaissance, Musicians in the
 * Industrial era, and the Prophets run out after the Renaissance, which is the
 * page's own "Industrial: No more Great Prophets".
 */
export const GREAT_PEOPLE: Record<GreatPersonClass, GreatPersonDef[]> = {
  SCIENTIST: [
    // Classical
    P('SCIENTIST', 'GP_ZHANG_HENG', 'Zhang Heng', 1),
    P('SCIENTIST', 'GP_ARYABHATA', 'Aryabhata', 1),
    P('SCIENTIST', 'GP_EUCLID', 'Euclid', 1),
    P('SCIENTIST', 'GP_HYPATIA', 'Hypatia', 1),
    // Medieval
    P('SCIENTIST', 'GP_ABU_AL_QASIM_AL_ZAHRAWI', 'Abu al-Qasim al-Zahrawi', 2),
    P('SCIENTIST', 'GP_HILDEGARD_OF_BINGEN', 'Hildegard of Bingen', 2),
    P('SCIENTIST', 'GP_OMAR_KHAYYAM', 'Omar Khayyam', 2),
    // Renaissance
    P('SCIENTIST', 'GP_IBN_KHALDUN', 'Ibn Khaldun', 3),
    P('SCIENTIST', 'GP_EMILIE_DU_CHATELET', 'Emilie du Chatelet', 3),
    P('SCIENTIST', 'GP_GALILEO_GALILEI', 'Galileo Galilei', 3),
    P('SCIENTIST', 'GP_ISAAC_NEWTON', 'Isaac Newton', 3),
    // Industrial
    P('SCIENTIST', 'GP_CHARLES_DARWIN', 'Charles Darwin', 4),
    P('SCIENTIST', 'GP_DMITRI_MENDELEEV', 'Dmitri Mendeleev', 4),
    P('SCIENTIST', 'GP_JAMES_YOUNG', 'James Young', 4),
    // Modern
    P('SCIENTIST', 'GP_ALAN_TURING', 'Alan Turing', 5),
    P('SCIENTIST', 'GP_ALBERT_EINSTEIN', 'Albert Einstein', 5),
    P('SCIENTIST', 'GP_ALFRED_NOBEL', 'Alfred Nobel', 5),
    // Atomic
    P('SCIENTIST', 'GP_ERWIN_SCHRODINGER', 'Erwin Schrödinger', 6),
    P('SCIENTIST', 'GP_JANAKI_AMMAL', 'Janaki Ammal', 6),
    P('SCIENTIST', 'GP_MARY_LEAKEY', 'Mary Leakey', 6),
    P('SCIENTIST', 'GP_MARGARET_MEAD', 'Margaret Mead', 6),
    // Information
    P('SCIENTIST', 'GP_CARL_SAGAN', 'Carl Sagan', 7),
    P('SCIENTIST', 'GP_STEPHANIE_KWOLEK', 'Stephanie Kwolek', 7),
    P('SCIENTIST', 'GP_ABDUS_SALAM', 'Abdus Salam', 7),
  ],
  ENGINEER: [
    // Medieval
    P('ENGINEER', 'GP_IMHOTEP', 'Imhotep', 2),
    P('ENGINEER', 'GP_BI_SHENG', 'Bi Sheng', 2),
    P('ENGINEER', 'GP_ISIDORE_OF_MILETUS', 'Isidore of Miletus', 2),
    P('ENGINEER', 'GP_JAMES_OF_ST_GEORGE', 'James of St. George', 2),
    // Renaissance
    P('ENGINEER', 'GP_FILIPPO_BRUNELLESCHI', 'Filippo Brunelleschi', 3),
    P('ENGINEER', 'GP_LEONARDO_DA_VINCI', 'Leonardo da Vinci', 3),
    P('ENGINEER', 'GP_MIMAR_SINAN', 'Mimar Sinan', 3),
    // Industrial
    P('ENGINEER', 'GP_ADA_LOVELACE', 'Ada Lovelace', 4),
    P('ENGINEER', 'GP_GUSTAVE_EIFFEL', 'Gustave Eiffel', 4),
    P('ENGINEER', 'GP_JAMES_WATT', 'James Watt', 4),
    // Modern
    P('ENGINEER', 'GP_SHAH_JAHAN', 'Shah Jahān', 5),
    P('ENGINEER', 'GP_ALVAR_AALTO', 'Alvar Aalto', 5),
    P('ENGINEER', 'GP_ROBERT_GODDARD', 'Robert Goddard', 5),
    P('ENGINEER', 'GP_NIKOLA_TESLA', 'Nikola Tesla', 5),
    // Atomic
    P('ENGINEER', 'GP_JANE_DREW', 'Jane Drew', 6),
    P('ENGINEER', 'GP_JOHN_ROEBLING', 'John Roebling', 6),
    P('ENGINEER', 'GP_SERGEI_KOROLEV', 'Sergei Korolev', 6),
    // Information
    P('ENGINEER', 'GP_JOSEPH_PAXTON', 'Joseph Paxton', 7),
    P('ENGINEER', 'GP_CHARLES_CORREA', 'Charles Correa', 7),
    P('ENGINEER', 'GP_WERNHER_VON_BRAUN', 'Wernher von Braun', 7),
    P('ENGINEER', 'GP_KENZO_TANGE', 'Kenzo Tange', 7),
  ],
  MERCHANT: [
    // Classical
    P('MERCHANT', 'GP_COLAEUS', 'Colaeus', 1),
    P('MERCHANT', 'GP_MARCUS_LICINIUS_CRASSUS', 'Marcus Licinius Crassus', 1),
    P('MERCHANT', 'GP_ZHANG_QIAN', 'Zhang Qian', 1),
    // Medieval
    P('MERCHANT', 'GP_IBN_FADLAN', 'Ibn Fadlan', 2),
    P('MERCHANT', 'GP_IRENE_OF_ATHENS', 'Irene of Athens', 2),
    P('MERCHANT', 'GP_MARCO_POLO', 'Marco Polo', 2),
    P('MERCHANT', 'GP_PIERO_DE_BARDI', 'Piero de\' Bardi', 2),
    // Renaissance
    P('MERCHANT', 'GP_ZHOU_DAGUAN', 'Zhou Daguan', 3),
    P('MERCHANT', 'GP_GIOVANNI_DE_MEDICI', 'Giovanni de\' Medici', 3),
    P('MERCHANT', 'GP_JAKOB_FUGGER', 'Jakob Fugger', 3),
    P('MERCHANT', 'GP_RAJA_TODAR_MAL', 'Raja Todar Mal', 3),
    // Industrial
    P('MERCHANT', 'GP_ADAM_SMITH', 'Adam Smith', 4),
    P('MERCHANT', 'GP_JOHN_JACOB_ASTOR', 'John Jacob Astor', 4),
    P('MERCHANT', 'GP_JOHN_SPILSBURY', 'John Spilsbury', 4),
    // Modern
    P('MERCHANT', 'GP_STAMFORD_RAFFLES', 'Stamford Raffles', 5),
    P('MERCHANT', 'GP_JOHN_ROCKEFELLER', 'John Rockefeller', 5),
    P('MERCHANT', 'GP_SARAH_BREEDLOVE', 'Sarah Breedlove', 5),
    P('MERCHANT', 'GP_MARY_KATHERINE_GODDARD', 'Mary Katherine Goddard', 5),
    // Atomic
    P('MERCHANT', 'GP_HELENA_RUBINSTEIN', 'Helena Rubinstein', 6),
    P('MERCHANT', 'GP_LEVI_STRAUSS', 'Levi Strauss', 6),
    P('MERCHANT', 'GP_MELITTA_BENTZ', 'Melitta Bentz', 6),
    // Information
    P('MERCHANT', 'GP_ESTEE_LAUDER', 'Estée Lauder', 7),
    P('MERCHANT', 'GP_JAMSETJI_TATA', 'Jamsetji Tata', 7),
    P('MERCHANT', 'GP_MASARU_IBUKA', 'Masaru Ibuka', 7),
  ],
  PROPHET: [
    // Classical
    P('PROPHET', 'GP_CONFUCIUS', 'Confucius', 1),
    P('PROPHET', 'GP_JOHN_THE_BAPTIST', 'John the Baptist', 1),
    P('PROPHET', 'GP_LAOZI', 'Laozi', 1),
    P('PROPHET', 'GP_SIDDHARTHA_GAUTAMA', 'Siddhartha Gautama', 1),
    P('PROPHET', 'GP_SIMON_PETER', 'Simon Peter', 1),
    P('PROPHET', 'GP_ZOROASTER', 'Zoroaster', 1),
    // Medieval
    P('PROPHET', 'GP_ADI_SHANKARA', 'Adi Shankara', 2),
    P('PROPHET', 'GP_BODHIDHARMA', 'Bodhidharma', 2),
    P('PROPHET', 'GP_IRENAEUS', 'Irenaeus', 2),
    P('PROPHET', 'GP_O_NO_YASUMARO', 'O no Yasumaro', 2),
    P('PROPHET', 'GP_SONGTSAN_GAMPO', 'Songtsan Gampo', 2),
    // Renaissance
    P('PROPHET', 'GP_HAJI_HUUD', 'Haji Huud', 3),
    P('PROPHET', 'GP_MADHVA_ACHARYA', 'Madhva Acharya', 3),
    P('PROPHET', 'GP_MARTIN_LUTHER', 'Martin Luther', 3),
    P('PROPHET', 'GP_THOMAS_AQUINAS', 'Thomas Aquinas', 3),
    P('PROPHET', 'GP_FRANCIS_OF_ASSISI', 'Francis of Assisi', 3),
  ],
  ARTIST: [
    // Renaissance
    P('ARTIST', 'GP_ANDREI_RUBLEV', 'Andrei Rublev', 3),
    P('ARTIST', 'GP_MICHELANGELO', 'Michelangelo', 3),
    P('ARTIST', 'GP_DONATELLO', 'Donatello', 3),
    P('ARTIST', 'GP_HIERONYMUS_BOSCH', 'Hieronymus Bosch', 3),
    P('ARTIST', 'GP_KAMAL_UD_DIN_BEHZAD', 'Kamāl ud-Dīn Behzād', 3),
    // Industrial
    P('ARTIST', 'GP_REMBRANDT_VAN_RIJN', 'Rembrandt van Rijn', 4),
    P('ARTIST', 'GP_EL_GRECO', 'El Greco', 4),
    P('ARTIST', 'GP_QIU_YING', 'Qiu Ying', 4),
    P('ARTIST', 'GP_TITIAN', 'Titian', 4),
    P('ARTIST', 'GP_HASEGAWA_TOHAKU', 'Hasegawa Tōhaku', 4),
    // Modern
    P('ARTIST', 'GP_JANG_SEUNG_EOP', 'Jang Seung-eop', 5),
    P('ARTIST', 'GP_SOFONISBA_ANGUISSOLA', 'Sofonisba Anguissola', 5),
    P('ARTIST', 'GP_ANGELICA_KAUFFMAN', 'Angelica Kauffman', 5),
    P('ARTIST', 'GP_KATSUSHIKA_HOKUSAI', 'Katsushika Hokusai', 5),
    // Atomic
    P('ARTIST', 'GP_EDMONIA_LEWIS', 'Edmonia Lewis', 6),
    P('ARTIST', 'GP_CLAUDE_MONET', 'Claude Monet', 6),
    P('ARTIST', 'GP_MARIE_ANNE_COLLOT', 'Marie-Anne Collot', 6),
    P('ARTIST', 'GP_VINCENT_VAN_GOGH', 'Vincent van Gogh', 6),
    // Information
    P('ARTIST', 'GP_AMRITA_SHER_GIL', 'Amrita Sher-Gil', 7),
    P('ARTIST', 'GP_BORIS_ORLOVSKY', 'Boris Orlovsky', 7),
    P('ARTIST', 'GP_GUSTAV_KLIMT', 'Gustav Klimt', 7),
    P('ARTIST', 'GP_MARY_CASSATT', 'Mary Cassatt', 7),
    P('ARTIST', 'GP_WASSILY_KANDINSKY', 'Wassily Kandinsky', 7),
  ],
  ADMIRAL: [
    // Classical
    P('ADMIRAL', 'GP_ARTEMISIA', 'Artemisia', 1),
    P('ADMIRAL', 'GP_GAIUS_DUILIUS', 'Gaius Duilius', 1),
    P('ADMIRAL', 'GP_THEMISTOCLES', 'Themistocles', 1),
    P('ADMIRAL', 'GP_HANNO_THE_NAVIGATOR', 'Hanno the Navigator', 1),
    // Medieval
    P('ADMIRAL', 'GP_HIMERIOS', 'Himerios', 2),
    P('ADMIRAL', 'GP_LEIF_ERIKSON', 'Leif Erikson', 2),
    P('ADMIRAL', 'GP_RAJENDRA_CHOLA', 'Rajendra Chola', 2),
    P('ADMIRAL', 'GP_ZHENG_HE', 'Zheng He', 2),
    // Renaissance
    P('ADMIRAL', 'GP_FRANCIS_DRAKE', 'Francis Drake', 3),
    P('ADMIRAL', 'GP_SANTA_CRUZ', 'Santa Cruz', 3),
    P('ADMIRAL', 'GP_YI_SUN_SIN', 'Yi Sun-Sin', 3),
    P('ADMIRAL', 'GP_FERDINAND_MAGELLAN', 'Ferdinand Magellan', 3),
    // Industrial
    P('ADMIRAL', 'GP_CHING_SHIH', 'Ching Shih', 4),
    P('ADMIRAL', 'GP_HORATIO_NELSON', 'Horatio Nelson', 4),
    P('ADMIRAL', 'GP_LASKARINA_BOUBOULINA', 'Laskarina Bouboulina', 4),
    // Modern
    P('ADMIRAL', 'GP_MATTHEW_PERRY', 'Matthew Perry', 5),
    P('ADMIRAL', 'GP_FRANZ_VON_HIPPER', 'Franz von Hipper', 5),
    P('ADMIRAL', 'GP_JOAQUIM_MARQUES_LISBOA', 'Joaquim Marques Lisboa', 5),
    P('ADMIRAL', 'GP_TOGO_HEIHACHIRO', 'Togo Heihachiro', 5),
    // Atomic
    P('ADMIRAL', 'GP_CHESTER_NIMITZ', 'Chester Nimitz', 6),
    P('ADMIRAL', 'GP_GRACE_HOPPER', 'Grace Hopper', 6),
    P('ADMIRAL', 'GP_SERGEI_GORSHKOV', 'Sergei Gorshkov', 6),
    // Information
    P('ADMIRAL', 'GP_CLANCY_FERNANDO', 'Clancy Fernando', 7),
  ],
  GENERAL: [
    // Classical
    P('GENERAL', 'GP_BOUDICA', 'Boudica', 1),
    P('GENERAL', 'GP_HANNIBAL_BARCA', 'Hannibal Barca', 1),
    P('GENERAL', 'GP_SUN_TZU', 'Sun Tzu', 1),
    P('GENERAL', 'GP_TRUNG_TRAC', 'Trưng Trắc', 1),
    // Medieval
    P('GENERAL', 'GP_THELFLD', 'Æthelflæd', 2),
    P('GENERAL', 'GP_EL_CID', 'El Cid', 2),
    P('GENERAL', 'GP_GENGHIS_KHAN_UNIT', 'Genghis Khan (unit)', 2),
    P('GENERAL', 'GP_TIMUR', 'Timur', 2),
    // Renaissance
    P('GENERAL', 'GP_ANA_NZINGA', 'Ana Nzinga', 3),
    P('GENERAL', 'GP_AMINA', 'Amina', 3),
    P('GENERAL', 'GP_GUSTAVUS_ADOLPHUS', 'Gustavus Adolphus', 3),
    P('GENERAL', 'GP_JEANNE_D_ARC', 'Jeanne d\'Arc', 3),
    // Industrial
    P('GENERAL', 'GP_DANDARA', 'Dandara', 4),
    P('GENERAL', 'GP_SIMON_BOLIVAR_UNIT', 'Simón Bolívar (unit)', 4),
    P('GENERAL', 'GP_JOSE_DE_SAN_MARTIN', 'José de San Martín', 4),
    P('GENERAL', 'GP_NAPOLEON_BONAPARTE', 'Napoleon Bonaparte', 4),
    P('GENERAL', 'GP_RANI_LAKSHMIBAI', 'Rani Lakshmibai', 4),
    // Modern
    P('GENERAL', 'GP_TUPAC_AMARU', 'Tupac Amaru', 5),
    P('GENERAL', 'GP_JOHN_MONASH', 'John Monash', 5),
    P('GENERAL', 'GP_MARINA_RASKOVA', 'Marina Raskova', 5),
    P('GENERAL', 'GP_SAMORI_TOURE', 'Samori Touré', 5),
    // Atomic
    P('GENERAL', 'GP_DOUGLAS_MACARTHUR', 'Douglas MacArthur', 6),
    P('GENERAL', 'GP_DWIGHT_EISENHOWER', 'Dwight Eisenhower', 6),
    P('GENERAL', 'GP_GEORGY_ZHUKOV', 'Georgy Zhukov', 6),
    P('GENERAL', 'GP_SUDIRMAN', 'Sudirman', 6),
    // Information
    P('GENERAL', 'GP_AHMAD_SHAH_MASSOUD', 'Ahmad Shah Massoud', 7),
    P('GENERAL', 'GP_VIJAYA_WIMALARATNE', 'Vijaya Wimalaratne', 7),
  ],
  WRITER: [
    // Classical
    P('WRITER', 'GP_HOMER', 'Homer', 1),
    P('WRITER', 'GP_BHASA', 'Bhasa', 1),
    P('WRITER', 'GP_QU_YUAN', 'Qu Yuan', 1),
    P('WRITER', 'GP_OVID', 'Ovid', 1),
    P('WRITER', 'GP_VALMIKI', 'Valmiki', 1),
    // Medieval
    P('WRITER', 'GP_GEOFFREY_CHAUCER', 'Geoffrey Chaucer', 2),
    P('WRITER', 'GP_LI_BAI', 'Li Bai', 2),
    P('WRITER', 'GP_MURASAKI_SHIKIBU', 'Murasaki Shikibu', 2),
    P('WRITER', 'GP_RUMI', 'Rumi', 2),
    // Renaissance
    P('WRITER', 'GP_MIGUEL_DE_CERVANTES', 'Miguel de Cervantes', 3),
    P('WRITER', 'GP_WILLIAM_SHAKESPEARE', 'William Shakespeare', 3),
    P('WRITER', 'GP_NICCOLO_MACHIAVELLI', 'Niccolò Machiavelli', 3),
    P('WRITER', 'GP_MARGARET_CAVENDISH', 'Margaret Cavendish', 3),
    P('WRITER', 'GP_MARIE_CATHERINE_D_AULNOY', 'Marie-Catherine d\'Aulnoy', 3),
    // Industrial
    P('WRITER', 'GP_JANE_AUSTEN', 'Jane Austen', 4),
    P('WRITER', 'GP_EDGAR_ALLAN_POE', 'Edgar Allan Poe', 4),
    P('WRITER', 'GP_ALEXANDER_PUSHKIN', 'Alexander Pushkin', 4),
    P('WRITER', 'GP_JOHANN_WOLFGANG_VON_GOETHE', 'Johann Wolfgang von Goethe', 4),
    P('WRITER', 'GP_MARY_SHELLEY', 'Mary Shelley', 4),
    // Modern
    P('WRITER', 'GP_JAMES_JOYCE', 'James Joyce', 5),
    P('WRITER', 'GP_EMILY_DICKINSON', 'Emily Dickinson', 5),
    P('WRITER', 'GP_LEO_TOLSTOY', 'Leo Tolstoy', 5),
    P('WRITER', 'GP_MARK_TWAIN', 'Mark Twain', 5),
    P('WRITER', 'GP_BEATRIX_POTTER', 'Beatrix Potter', 5),
    P('WRITER', 'GP_F_SCOTT_FITZGERALD', 'F. Scott Fitzgerald', 5),
    // Atomic
    P('WRITER', 'GP_RABINDRANATH_TAGORE', 'Rabindranath Tagore', 6),
    P('WRITER', 'GP_H_G_WELLS', 'H. G. Wells', 6),
    // Information
    P('WRITER', 'GP_KAREL_CAPEK', 'Karel Capek', 7),
    P('WRITER', 'GP_GABRIELA_MISTRAL', 'Gabriela Mistral', 7),
  ],
  MUSICIAN: [
    // Industrial
    P('MUSICIAN', 'GP_LUDWIG_VAN_BEETHOVEN', 'Ludwig van Beethoven', 4),
    P('MUSICIAN', 'GP_JOHANN_SEBASTIAN_BACH', 'Johann Sebastian Bach', 4),
    P('MUSICIAN', 'GP_YATSUHASHI_KENGYO', 'Yatsuhashi Kengyo', 4),
    P('MUSICIAN', 'GP_ANTONIO_VIVALDI', 'Antonio Vivaldi', 4),
    P('MUSICIAN', 'GP_WOLFGANG_AMADEUS_MOZART', 'Wolfgang Amadeus Mozart', 4),
    P('MUSICIAN', 'GP_DIMITRIE_CANTEMIR', 'Dimitrie Cantemir', 4),
    // Modern
    P('MUSICIAN', 'GP_FRANZ_LISZT', 'Franz Liszt', 5),
    P('MUSICIAN', 'GP_PETER_ILYICH_TCHAIKOVSKY', 'Peter Ilyich Tchaikovsky', 5),
    P('MUSICIAN', 'GP_ANTONIO_CARLOS_GOMES', 'Antônio Carlos Gomes', 5),
    P('MUSICIAN', 'GP_LIU_TIANHUA', 'Liu Tianhua', 5),
    P('MUSICIAN', 'GP_FREDERIC_CHOPIN', 'Frédéric Chopin', 5),
    P('MUSICIAN', 'GP_SCOTT_JOPLIN', 'Scott Joplin', 5),
    // Atomic
    P('MUSICIAN', 'GP_JUVENTINO_ROSAS', 'Juventino Rosas', 6),
    P('MUSICIAN', 'GP_ANTONIN_DVORAK', 'Antonín Dvořák', 6),
    P('MUSICIAN', 'GP_LILI_UOKALANI', 'Lili\'uokalani', 6),
    P('MUSICIAN', 'GP_CLARA_SCHUMANN', 'Clara Schumann', 6),
    // Information
    P('MUSICIAN', 'GP_MYKOLA_LEONTOVYCH', 'Mykola Leontovych', 7),
    P('MUSICIAN', 'GP_GAUHAR_JAAN', 'Gauhar Jaan', 7),
  ],
};
export const GP_CLASSES = Object.keys(GP_CLASS_DISTRICT) as GreatPersonClass[];


/**
 * GREAT WORKS. A claimed WRITER, ARTIST or MUSICIAN carries
 * GW_WORKS_PER_PERSON[kind] Great Works that seek an OPEN SLOT of the matching
 * building in the claiming civ's cities.
 * Charges with no open slot ANYWHERE degrade to the person's instant culture
 * lump, one lump per overflowing charge.
 *
 * THE REAL CIV 6 MAPPING. Reachability is a measurement tool, never a licence
 * to deviate: a building past this repo's gate horizon still gets its real
 * home, because a model trained on a deliberately-wrong mechanic has learned
 * the wrong game. Verified against the Civilization wiki ("Great Work (Civ6)",
 * per-building and per-Great-Person pages):
 *
 *   kind 0 WRITING — Amphitheater,      2 slots, +2 culture / +2 tourism, Writer   makes 2
 *   kind 1 ART     — Art Museum,        3 slots, +2 culture / +2 tourism, Artist   makes 3
 *   kind 2 MUSIC   — Broadcast Center,  1 slot,  +4 culture / +4 tourism, Musician makes 2
 *
 * (RELICS are the fourth Great Work kind and live in their own constants below
 * — they sit in a Temple slot and pay faith + tourism, not culture.)
 *
 * NO Great Work pays gold.
 */
export const GW_WRITING = 0;
export const GW_ART = 1;
export const GW_MUSIC = 2;

export const GW_BUILDINGS = ['AMPHITHEATER', 'MUSEUM', 'BROADCAST_CENTER'] as const;

export const ARTIFACT_BUILDING = 'ARCHAEOLOGICAL_MUSEUM';
export const ARTIFACT_SLOTS = 3;
export const ARTIFACT_CULTURE = 3;
export const ARTIFACT_TOURISM = 3;
export const ARCHAEOLOGIST_CHARGES = 3;
export const ARCHAEOLOGIST_CIVIC = 'NATURAL_HISTORY';

type ArtCity = { artifacts?: number; artifactEras?: number[]; artifactSeats?: number[] };

/**
 * Is this city's ARCHAEOLOGICAL MUSEUM themed? CIV6: the slots must
 * be full, every Artifact from the SAME ERA, and no two from the same
 * civilization (a city-state, a Free City and the Barbarians each count as
 * one). A themed museum DOUBLES the yields of everything in it.
 */
export function museumThemed(city: ArtCity): boolean {
  if ((city.artifacts ?? 0) < ARTIFACT_SLOTS) return false;
  const eras = city.artifactEras ?? [];
  const seats = city.artifactSeats ?? [];
  if (eras.length < ARTIFACT_SLOTS || seats.length < ARTIFACT_SLOTS) return false;
  for (let i = 1; i < ARTIFACT_SLOTS; i++) if (eras[i] !== eras[0]) return false;
  for (let i = 0; i < ARTIFACT_SLOTS; i++) {
    for (let j = i + 1; j < ARTIFACT_SLOTS; j++) if (seats[i] === seats[j]) return false;
  }
  return true;
}

export const THEMING_MULT = 2;

export function artifactCulture(city: ArtCity): number {
  return (city.artifacts ?? 0) * ARTIFACT_CULTURE * (museumThemed(city) ? THEMING_MULT : 1);
}
export function artifactTourism(city: ArtCity): number {
  return (city.artifacts ?? 0) * ARTIFACT_TOURISM * (museumThemed(city) ? THEMING_MULT : 1);
}
export const GW_SLOTS = [2, 3, 1] as const;
/** How many KINDS of Great Work there are — writing, art, music. */
export const GW_KINDS = 3;
/** CIV6: Great Work slots a COMPLETE wonder adds to its city, in kind order
 *  (writing, art, music) — additive with GW_BUILDINGS' slots, so a wonder
 *  holds works in a city with no Amphitheater at all. Great Library "+2 Great
 *  Works of Writing slots"; Hermitage "+4 Landscape Great Works of Art slots"
 *  (the LANDSCAPE restriction needs a per-work TYPE this model does not
 *  carry, so all four take any Art work); Bolshoi Theatre "+1 Great Work of
 *  Writing slot, +1 Great Work of Music slot". */
export const GW_WONDER_SLOTS: Record<string, readonly [number, number, number]> = {
  GREAT_LIBRARY: [2, 0, 0],
  OXFORD_UNIVERSITY: [2, 0, 0],
  HERMITAGE: [0, 4, 0],
  BOLSHOI_THEATRE: [1, 0, 1],
};

/** CIV6: RELIC slots a COMPLETE wonder adds to its city, additive with the
 *  TEMPLE's. St. Basil's Cathedral "+3 Relic slots", Mont St. Michel
 *  "2 Relic slots". */
export const RELIC_WONDER_SLOTS: Record<string, number> = {
  ST_BASILS_CATHEDRAL: 3,
  MONT_ST_MICHEL: 2,
};
/**
 * The four TYPES a Great Work of Art can have, from the theming rule that
 * reads them: "Great Works of Art of the same type (i.e., Sculptures,
 * Portraits, Landscapes, or Religious)".
 */
export const ART_RELIGIOUS = 0;
export const ART_SCULPTURE = 1;
export const ART_PORTRAIT = 2;
export const ART_LANDSCAPE = 3;

/**
 * The three works each Great Artist makes, in creation order — transcribed from
 * the Great Artist (Civ6) roster's own "Great Works of Art" column, one row per
 * artist and indexed the same way as `GREAT_PEOPLE.ARTIST`.
 */
export const ARTIST_WORKS: readonly (readonly number[])[] = [
  [ART_RELIGIOUS, ART_RELIGIOUS, ART_RELIGIOUS],
  [ART_RELIGIOUS, ART_SCULPTURE, ART_SCULPTURE],
  [ART_SCULPTURE, ART_SCULPTURE, ART_SCULPTURE],
  [ART_RELIGIOUS, ART_RELIGIOUS, ART_RELIGIOUS],
  [ART_RELIGIOUS, ART_RELIGIOUS, ART_RELIGIOUS],
  [ART_PORTRAIT, ART_PORTRAIT, ART_RELIGIOUS],
  [ART_RELIGIOUS, ART_RELIGIOUS, ART_LANDSCAPE],
  [ART_LANDSCAPE, ART_LANDSCAPE, ART_LANDSCAPE],
  [ART_RELIGIOUS, ART_RELIGIOUS, ART_PORTRAIT],
  [ART_RELIGIOUS, ART_RELIGIOUS, ART_RELIGIOUS],
  [ART_LANDSCAPE, ART_LANDSCAPE, ART_LANDSCAPE],
  [ART_PORTRAIT, ART_PORTRAIT, ART_PORTRAIT],
  [ART_PORTRAIT, ART_PORTRAIT, ART_PORTRAIT],
  [ART_LANDSCAPE, ART_LANDSCAPE, ART_LANDSCAPE],
  [ART_SCULPTURE, ART_SCULPTURE, ART_SCULPTURE],
  [ART_LANDSCAPE, ART_LANDSCAPE, ART_LANDSCAPE],
  [ART_SCULPTURE, ART_SCULPTURE, ART_SCULPTURE],
  [ART_LANDSCAPE, ART_LANDSCAPE, ART_LANDSCAPE],
  [ART_PORTRAIT, ART_PORTRAIT, ART_PORTRAIT],
  [ART_SCULPTURE, ART_SCULPTURE, ART_SCULPTURE],
  [ART_PORTRAIT, ART_LANDSCAPE, ART_LANDSCAPE],
  [ART_PORTRAIT, ART_PORTRAIT, ART_PORTRAIT],
  [ART_RELIGIOUS, ART_RELIGIOUS, ART_RELIGIOUS],
];


export const GW_WORKS_PER_PERSON = [2, 3, 2] as const;
export const GW_CULTURE = [2, 2, 4] as const;
export const GW_TOURISM = [2, 2, 4] as const;

export const GW_CLASS_KIND: Partial<Record<GreatPersonClass, number>> = {
  WRITER: GW_WRITING,
  ARTIST: GW_ART,
  MUSICIAN: GW_MUSIC,
};
export const GW_WORK_CLASSES = new Set<GreatPersonClass>(['WRITER', 'ARTIST', 'MUSICIAN']);

type GwCity = {
  greatWorksWriting?: number;
  greatWorksArt?: number;
  greatWorksMusic?: number;
  /** The ART MUSEUM's own slots, in fill order: what each holds and who made
   *  it. Only the museum themes, so only its `GW_SLOTS[GW_ART]` slots need a
   *  provenance — a wonder's art slots never do. */
  gwArtType?: number[];
  gwArtArtist?: number[];
  wonders?: { id: string; tileIndex: number }[];
};

/**
 * Is this city's ART MUSEUM themed? CIV6: "its slots must be filled with Great
 * Works of Art of the same type ... made by different Great Artists. This means
 * that a minimum of three Great Artists are needed to activate each Art
 * Museum's theming bonus." A themed museum DOUBLES the yields of everything in
 * it.
 */
export function artMuseumThemed(city: GwCity): boolean {
  const n: number = GW_SLOTS[GW_ART];
  const types = city.gwArtType ?? [];
  const artists = city.gwArtArtist ?? [];
  if (gwCount(city, GW_ART) < n || types.length < n || artists.length < n) return false;
  for (let i = 1; i < n; i++) if (types[i] !== types[0]) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) if (artists[i] === artists[j]) return false;
  }
  return true;
}

export function gwCount(city: GwCity, kind: number): number {
  return (kind === GW_WRITING ? city.greatWorksWriting : kind === GW_ART ? city.greatWorksArt : city.greatWorksMusic) ?? 0;
}

function gwSet(city: GwCity, kind: number, n: number): void {
  if (kind === GW_WRITING) city.greatWorksWriting = n;
  else if (kind === GW_ART) city.greatWorksArt = n;
  else city.greatWorksMusic = n;
}

/** How many works of `kind` this city can hold: the slot BUILDING's own,
 *  plus whatever its completed wonders add. */
export function gwCapacity(city: GwCity & { buildings: string[] }, kind: number, extra = 0): number {
  return (city.buildings.includes(GW_BUILDINGS[kind]) ? GW_SLOTS[kind] : 0) + extra;
}

/** Hand a work OUT of this city, returning the provenance it was made with
 *  ([-1, -1] for the two kinds that carry none). The LAST slot goes: the
 *  museum fills from the front, so it is the only one whose removal leaves
 *  the rest contiguous. */
export function gwTake(city: GwCity, kind: number): [number, number] {
  const used = gwCount(city, kind);
  let prov: [number, number] = [-1, -1];
  if (kind === GW_ART) {
    const types = (city.gwArtType ??= []);
    const artists = (city.gwArtArtist ??= []);
    const at = used - 1;
    if (at >= 0 && at < GW_SLOTS[GW_ART]) {
      prov = [types[at] ?? -1, artists[at] ?? -1];
      types[at] = -1;
      artists[at] = -1;
    }
  }
  gwSet(city, kind, Math.max(0, used - 1));
  return prov;
}

/** Take a work IN, with the provenance it was made with — a gifted work is
 *  still that artist's, which is what the receiving museum themes on. */
export function gwGive(city: GwCity, kind: number, prov: [number, number]): void {
  const used = gwCount(city, kind);
  if (kind === GW_ART) {
    const types = (city.gwArtType ??= []);
    const artists = (city.gwArtArtist ??= []);
    for (let s = types.length; s < GW_SLOTS[GW_ART]; s++) { types[s] = -1; artists[s] = -1; }
    if (used < GW_SLOTS[GW_ART]) { types[used] = prov[0]; artists[used] = prov[1]; }
  }
  gwSet(city, kind, used + 1);
}

/**
 * PRINTING doubles the TOURISM of Great Works of WRITING (real
 * Civ 6 — verified against the Civilization wiki's Printing/Great Work pages;
 * it is the TOURISM that doubles, not the Amphitheater's slot count, which
 * stays at 2). Culture is untouched. `printing` is the owning civ's tech state.
 */
export const GW_PRINTING_TECH = 'PRINTING';
export const GW_PRINTING_WRITING_MULT = 2;

/** How many ART works pay TWICE: the themed museum's own slots, and only
 *  those — a wonder's art slots sit outside the bonus. */
function artThemedWorks(city: GwCity): number {
  return artMuseumThemed(city) ? (THEMING_MULT - 1) * GW_SLOTS[GW_ART] : 0;
}

export function greatWorkTourism(city: GwCity, printing = false, kmult: readonly [number, number, number] = [1, 1, 1]): number {
  const writing = GW_TOURISM[GW_WRITING] * (printing ? GW_PRINTING_WRITING_MULT : 1) * gwCount(city, GW_WRITING) * kmult[0];
  const art = gwCount(city, GW_ART) + artThemedWorks(city);
  return writing + GW_TOURISM[GW_ART] * art * kmult[1] + GW_TOURISM[GW_MUSIC] * gwCount(city, GW_MUSIC) * kmult[2];
}

/**
 * RELICS — the fourth Great Work kind. Real Civ 6 holds
 * a Relic in a TEMPLE's single slot and pays it +4 Faith and +8 Tourism, the
 * densest tourism source in the game (verified: Civilization wiki
 * "Relics"/"Great Work (Civ6)", Gathering Storm). Relics pay no culture, which
 * is why they sit outside the GW_* kind arrays above.
 *
 * SOURCE: real Civ 6 creates a relic when an Apostle carrying the MARTYR
 * promotion is killed in theological combat, which `theologicalCombatPhase`
 * reads off the unit's own promotion bits. A dead MISSIONARY never yields one.
 */
export const RELIC_BUILDING = 'TEMPLE';
export const RELIC_SLOTS_PER_BUILDING = 1;
export const RELIC_FAITH = 4;
export const RELIC_TOURISM = 8;

export function relicFaith(city: { relics?: number }): number {
  return RELIC_FAITH * (city.relics ?? 0);
}

export function relicTourism(city: { relics?: number }): number {
  return RELIC_TOURISM * (city.relics ?? 0);
}

/**
 * Place ONE relic into `cities` (visited in array order — the
 * acquisition/slot order both engines share). A city's capacity is its
 * TEMPLE's slots plus `extra` (the wonder slots its caller sums), so a
 * cathedral holds relics in a city with no Temple. Returns true when it found
 * a home.
 *
 * A relic that finds no open slot anywhere is LOST. Real Civ 6 holds it in
 * reserve until a slot opens; that reserve is an OPEN gap, not a decision.
 */
type RelicCity = { buildings: string[]; relics?: number; wonders?: { id: string; tileIndex: number }[] };

export function placeRelic(cities: RelicCity[], extra?: (city: RelicCity) => number): boolean {
  for (const c of cities) {
    const cap = (c.buildings.includes(RELIC_BUILDING) ? RELIC_SLOTS_PER_BUILDING : 0) + (extra?.(c) ?? 0);
    const used = c.relics ?? 0;
    if (used >= cap) continue;
    c.relics = used + 1;
    return true;
  }
  return false;
}

/** Hand out held Relics — one per open slot, LOWEST city first, until the
 *  reserve or the capacity runs out. The `placeRelic` loop, drained. */
export function drainRelicReserve(
  held: number,
  cities: RelicCity[],
  extra?: (city: RelicCity) => number,
): number {
  let left = held;
  while (left > 0 && placeRelic(cities, extra)) left -= 1;
  return left;
}

export function cityGreatWorks(city: GwCity): number {
  return gwCount(city, GW_WRITING) + gwCount(city, GW_ART) + gwCount(city, GW_MUSIC);
}

export function greatWorkCulture(city: GwCity): number {
  const art = gwCount(city, GW_ART) + artThemedWorks(city);
  return GW_CULTURE[GW_WRITING] * gwCount(city, GW_WRITING) + GW_CULTURE[GW_ART] * art + GW_CULTURE[GW_MUSIC] * gwCount(city, GW_MUSIC);
}

export function placeGreatWorks(
  cities: (GwCity & { buildings: string[] })[],
  kind: number,
  extra?: (city: GwCity & { buildings: string[] }) => number,
  artist = 0,
): number {
  const per: number = GW_WORKS_PER_PERSON[kind];
  let remaining: number = per;
  for (const c of cities) {
    if (remaining <= 0) break;
    // Capacity is the BUILDING's slots plus any wonder's, so a wonder holds
    // works in a city with no Amphitheater at all — which is how Civ 6 works.
    const cap = gwCapacity(c, kind, extra?.(c) ?? 0);
    const used = gwCount(c, kind);
    const open = cap - used;
    if (open <= 0) continue;
    const take = Math.min(open, remaining);
    if (kind === GW_ART) {
      // WHO made it and WHAT it is, for the museum's own slots. The work index
      // is the ARTIST's (their first, second or third), which is what names
      // the type; the slot index is the museum's.
      const works = ARTIST_WORKS[artist] ?? ARTIST_WORKS[0];
      const types = (c.gwArtType ??= []);
      const artists = (c.gwArtArtist ??= []);
      for (let s = types.length; s < GW_SLOTS[GW_ART]; s++) { types[s] = -1; artists[s] = -1; }
      for (let k = 0; k < take && used + k < GW_SLOTS[GW_ART]; k++) {
        types[used + k] = works[(per - remaining) + k] ?? works[0];
        artists[used + k] = artist;
      }
    }
    gwSet(c, kind, used + take);
    remaining -= take;
  }
  return remaining;
}

/** Specialist yields per district type (Civ 6-ish; only these take specialists). */
/** CIV6 (wiki "Specialists (Civ6)", GS values): base yields per specialist
 * by district — Scientists +2 science, Priests +2 faith, Merchants +4 gold,
 * Captains +1 food +2 gold, Artists +2 culture, Engineers +2 production,
 * Commanders +1 production +2 gold. One slot per BUILDING in the district
 * (max 3); a pillaged district's slots stop working. */
export const SPECIALIST_YIELDS: Partial<Record<DistrictId, Partial<Record<'food' | 'production' | 'gold' | 'science' | 'culture' | 'faith', number>>>> = {
  CAMPUS: { science: 2 },
  HOLY_SITE: { faith: 2 },
  COMMERCIAL_HUB: { gold: 4 },
  HARBOR: { gold: 2, food: 1 },
  THEATER_SQUARE: { culture: 2 },
  INDUSTRIAL_ZONE: { production: 2 },
  ENCAMPMENT: { production: 1, gold: 2 },
};

/** CIV6 (same page): the district's TOP building upgrades its specialists —
 * "+3 Science instead with a Research Lab", "+3 Faith instead with a Tier 3
 * Worship building", "+2 Production and +2 Gold instead with a Military
 * Academy", "+2 Food and +2 Gold instead with a Seaport", "+6 Gold instead
 * with a Stock Exchange", "+3 Production instead with a Power Plant" (any of
 * the three), "+3 Culture instead with a Broadcast Center". Each entry names
 * the building ids that count, or 'WORSHIP' for any worship building. */
export const SPECIALIST_TIERS: Partial<Record<DistrictId, { buildings: string[]; add: Partial<Record<'food' | 'production' | 'gold' | 'science' | 'culture' | 'faith', number>> }>> = {
  CAMPUS: { buildings: ['RESEARCH_LAB'], add: { science: 1 } },
  HOLY_SITE: { buildings: ['WORSHIP'], add: { faith: 1 } },
  ENCAMPMENT: { buildings: ['MILITARY_ACADEMY'], add: { production: 1 } },
  HARBOR: { buildings: ['SEAPORT'], add: { food: 1 } },
  COMMERCIAL_HUB: { buildings: ['STOCK_EXCHANGE'], add: { gold: 2 } },
  // ANY of the three plants is the Industrial Zone's top building.
  INDUSTRIAL_ZONE: { buildings: ['COAL_POWER_PLANT', 'OIL_POWER_PLANT', 'NUCLEAR_POWER_PLANT'], add: { production: 1 } },
  THEATER_SQUARE: { buildings: ['BROADCAST_CENTER'], add: { culture: 1 } },
};

/**
 * WHERE a Great Person's charge may be spent. CIV6 (Great People, "Activating
 * Great People"): "For most Great People, these actions may only be taken in
 * specific places (i.e., a city district relevant to their abilities). That
 * would generally be the Campus for the Great Scientist, the Commercial Hub
 * for the Great Merchant, the Industrial Zone for the Great Engineer, the
 * Theater Square for the art-related Great Persons - and, of course, the Holy
 * Site for the Great Prophet. The Great General's and Great Admiral's one-time
 * abilities may usually be activated anywhere." The art classes carry the same
 * page's stricter clause: they "need to be in a Theater Square or otherwise in
 * a tile with a building which provides free slots for the relevant type of
 * Great Work", and with every slot taken "you will be unable to Activate your
 * Great Person". The rest are individual pages' own wording.
 */
export type GpSite =
  | 'district'     // this seat's COMPLETED district — `siteDistrict`, or the class's own
  | 'anywhere'     // any tile the unit can stand on
  | 'gwSlot'       // a city of this seat with a free slot of the class's work kind
  | 'cityState'    // inside a city-state's territory
  | 'luxury'       // an owned tile carrying a luxury resource
  | 'adjacentOwn'; // an unclaimed tile next to this seat's territory

/** PERMANENT per-seat channels a Great Person adds to. The array position is
 *  the wire index, so a new channel appends. */
export const GP_PERM = [
  'spaceProdPct',        // Space Race project production, percent
  'warWearyPct',         // war weariness accrued, percent off
  'flankPctLand',        // flanking bonus for LAND units, percent
  'flankPctNaval',       // flanking bonus for NAVAL units, percent
  'unitProdPct',         // unit production, percent
  'routePlunderPct',     // gold from plundering a sea trade route, percent
  'healBonus',           // extra HP healed per turn
  'tradeCapacity',       // extra simultaneous trade routes
  'policySlotEconomic',  // extra Economic policy slots
  'workshopCulture',     // CIV6 (Leonardo da Vinci): "Workshops provide +3 Culture"
] as const;
export type GpPermKey = (typeof GP_PERM)[number];

/** PERMANENT per-city channels, same contract — the ACTIVATING city keeps them. */
export const GP_CITY_PERM = ['housing', 'amenities', 'appeal', 'loyalty', 'districtLimit'] as const;
export type GpCityPermKey = (typeof GP_CITY_PERM)[number];

export type GpYieldKey = 'science' | 'culture' | 'gold' | 'faith';

export function gpPermOf(seat: { gpPerm?: number[] } | undefined, key: GpPermKey): number {
  return seat?.gpPerm?.[GP_PERM.indexOf(key)] ?? 0;
}

export function gpCityPermOf(city: { gpPerm?: number[] } | undefined, key: GpCityPermKey): number {
  return city?.gpPerm?.[GP_CITY_PERM.indexOf(key)] ?? 0;
}

export interface GpEffect {
  science?: number; // into the current technology's progress
  culture?: number; // into the current civic's progress
  faith?: number;
  gold?: number;
  productionToCapital?: number;
  /** eurekas for NAMED technologies. CIV6 (Zhang Heng): "If they are already
   *  triggered, instead completes the technology." */
  eurekaTechs?: string[];
  /** eurekas for N technologies drawn at random over the eras
   *  `era + eurekaLo` .. `era + eurekaHi`, both 0 by default. */
  eurekaRandom?: number;
  eurekaLo?: number;
  eurekaHi?: number;
  /** the same draw against the CIVIC tree, over the same era window. */
  inspirationRandom?: number;
  /** every technology of the person's own era at once. */
  eurekaEra?: boolean;
  /** technologies COMPLETED outright, drawn over what is available. */
  freeTechRandom?: number;
  /** buildings finished instantly in the activating city. */
  buildings?: string[];
  /** a free unit at the activating tile, carrying `unitPromotions` levels. */
  unit?: string;
  unitPromotions?: number;
  /** promotion levels for a unit ALREADY on the activating tile, plus a
   *  permanent percentage experience bonus for that unit. */
  promotionLevels?: number;
  xpPct?: number;
  envoys?: number;
  /** CIV6 (Matthew Perry): "Grants enough Envoys to become Suzerain at this
   *  City-state, then removes all other players' Envoys." */
  suzerainSeize?: boolean;
  /** production into a WONDER under construction in the activating city,
   *  doubled when that wonder's era is at or below `wonderEraDouble`. */
  wonderProduction?: number;
  wonderEraDouble?: number;
  /** production into a SPACE RACE project in the activating city. */
  spaceProduction?: number;
  /** `amount` of `yield` per neighbouring tile carrying `source`, and for the
   *  activating tile itself when `here`. */
  perAdjacent?: { source: 'MOUNTAIN' | 'NATURAL_WONDER' | 'RAINFOREST'; yield: GpYieldKey; amount: number; here?: boolean };
  /** invented luxuries: `luxuryCopies` of them, each serving
   *  `luxuryAmenities` cities the way a worked luxury resource does. */
  luxuryCopies?: number;
  luxuryAmenities?: number;
  /** a Great Work of this kind, made on the spot. */
  greatWorkKind?: number;
  /** Great Person points toward EVERY class at once. */
  gppAll?: number;
  /** a strategic resource straight into the stockpile. */
  strategic?: { resource: string; amount: number };
  /** CIV6 (Mary Leakey): science "for every Artifact in this city", instant. */
  artifactScience?: number;
  /** CIV6 (Marina Raskova): "District in this tile gains +1 air unit
   *  slots" — a permanent per-tile add on the activating tile. */
  airSlotBonus?: number;
  perm?: Partial<Record<GpPermKey, number>>;
  cityPerm?: Partial<Record<GpCityPermKey, number>>;
}

/**
 * THE DENSE EFFECT ROW both engines read, by name. The exporter emits this
 * list beside the table, so the GPU never writes a column number down and a
 * new channel appends here and nowhere else. `perm` and `cityPerm` ride the
 * tail as their own runs, in `GP_PERM` / `GP_CITY_PERM` order.
 */
export const GP_FX = [
  'science', 'culture', 'gold', 'prodCapital', 'faith',
  'eurekaRandom', 'eurekaLo', 'eurekaHi', 'inspirationRandom', 'eurekaEra', 'freeTechRandom',
  'unitIdx', 'unitPromotions', 'promotionLevels', 'xpPct',
  'envoys', 'wonderProduction', 'wonderEraDouble', 'spaceProduction',
  'perAdjSource', 'perAdjYield', 'perAdjAmount', 'perAdjHere',
  'luxuryCopies', 'luxuryAmenities', 'greatWorkKind', 'gppAll',
  'strategicSlot', 'strategicAmount',
  'artifactScience', 'airSlotBonus', 'suzerainSeize',
] as const;

/** what a `perAdjacent` clause counts, in the wire's own order. */
export const GP_PER_ADJ_SOURCES = ['MOUNTAIN', 'NATURAL_WONDER', 'RAINFOREST'] as const;
/** and which ledger it pays into. */
export const GP_YIELD_KEYS: readonly GpYieldKey[] = ['science', 'culture', 'gold', 'faith'];

/** the ACTIVATION SITES, in the wire's own order. */
export const GP_SITES: readonly GpSite[] = [
  'district', 'anywhere', 'gwSlot', 'cityState', 'luxury', 'adjacentOwn',
];

export interface GpAbility extends GpEffect {
  site?: GpSite;
  siteDistrict?: DistrictId;
  charges?: number;
  /** this person's page clause has no carrier in this engine, so the class
   *  lump stands in for it and the clause is an open audit item. */
  unmodelled?: boolean;
}

/**
 * WHAT EACH PERSON DOES, off that class's own wiki roster table. Only the five
 * one-off classes are listed: a Prophet founds a religion and a Writer, Artist
 * or Musician makes Great Works, both of which this engine already models in
 * kind, so those four keep the class lump `gpEffect` sizes by era.
 *
 * A clause with no carrier is absent from its row, and a person whose WHOLE
 * clause has no carrier is marked `unmodelled` rather than quietly dropped.
 */
export const GP_ABILITY: Record<string, GpAbility> = {
  // ---- SCIENTIST: eurekas, and the Campus that hosts them ----
  GP_ZHANG_HENG: { eurekaTechs: ['CELESTIAL_NAVIGATION', 'MATHEMATICS', 'ENGINEERING'] },
  GP_ARYABHATA: { eurekaRandom: 3, eurekaHi: 1 },
  GP_EUCLID: { eurekaTechs: ['MATHEMATICS'], eurekaRandom: 1, eurekaLo: 1, eurekaHi: 1 },
  GP_HYPATIA: { buildings: ['LIBRARY'] },
  GP_ABU_AL_QASIM_AL_ZAHRAWI: { site: 'anywhere', eurekaRandom: 1, eurekaHi: 1, perm: { healBonus: 5 } },
  GP_HILDEGARD_OF_BINGEN: { siteDistrict: 'HOLY_SITE', faith: 100 },
  GP_OMAR_KHAYYAM: { eurekaRandom: 2, eurekaHi: 1, inspirationRandom: 1 },
  GP_IBN_KHALDUN: { cityPerm: { housing: 2, amenities: 1 } },
  GP_EMILIE_DU_CHATELET: { eurekaRandom: 3, eurekaHi: 1 },
  GP_GALILEO_GALILEI: { perAdjacent: { source: 'MOUNTAIN', yield: 'science', amount: 250 } },
  GP_ISAAC_NEWTON: { buildings: ['LIBRARY', 'UNIVERSITY'] },
  GP_CHARLES_DARWIN: { perAdjacent: { source: 'NATURAL_WONDER', yield: 'science', amount: 500 } },
  GP_DMITRI_MENDELEEV: { eurekaTechs: ['CHEMISTRY'], eurekaRandom: 1 },
  GP_JAMES_YOUNG: { eurekaRandom: 2, eurekaHi: 1 },
  GP_ALAN_TURING: { eurekaTechs: ['COMPUTERS'], eurekaRandom: 1 },
  GP_ALBERT_EINSTEIN: { eurekaRandom: 1 },
  GP_ALFRED_NOBEL: { eurekaRandom: 1, eurekaHi: 1, gppAll: 100 },
  GP_ERWIN_SCHRODINGER: { eurekaRandom: 3, eurekaHi: 1 },
  GP_JANAKI_AMMAL: { perAdjacent: { source: 'RAINFOREST', yield: 'science', amount: 400, here: true } },
  GP_MARY_LEAKEY: { artifactScience: 350 }, // the tourism clause waits on the tourism system
  GP_MARGARET_MEAD: { science: 1000, culture: 1000 },
  GP_CARL_SAGAN: { spaceProduction: 3000 },
  GP_STEPHANIE_KWOLEK: { perm: { spaceProdPct: 100 } },
  GP_ABDUS_SALAM: { eurekaEra: true },

  // ---- ENGINEER: wonders, buildings and the Space Race ----
  GP_IMHOTEP: { charges: 2, wonderProduction: 175, wonderEraDouble: 1 },
  GP_BI_SHENG: { eurekaTechs: ['PRINTING'], cityPerm: { districtLimit: 1 } },
  GP_ISIDORE_OF_MILETUS: { charges: 2, wonderProduction: 215 },
  GP_JAMES_OF_ST_GEORGE: { charges: 3, buildings: ['ANCIENT_WALLS', 'MEDIEVAL_WALLS'] },
  GP_FILIPPO_BRUNELLESCHI: { charges: 2, wonderProduction: 315 },
  GP_LEONARDO_DA_VINCI: { eurekaRandom: 1, eurekaLo: 2, eurekaHi: 2, perm: { workshopCulture: 3 } },
  GP_MIMAR_SINAN: { cityPerm: { housing: 1, amenities: 1 } },
  GP_ADA_LOVELACE: { eurekaTechs: ['COMPUTERS'], cityPerm: { districtLimit: 1 } },
  GP_GUSTAVE_EIFFEL: { charges: 2, wonderProduction: 480 },
  GP_JAMES_WATT: { buildings: ['WORKSHOP', 'FACTORY'] },
  GP_SHAH_JAHAN: { unmodelled: true },
  GP_ALVAR_AALTO: { cityPerm: { appeal: 1 } },
  GP_ROBERT_GODDARD: { eurekaTechs: ['ROCKETRY'], perm: { spaceProdPct: 20 } },
  GP_NIKOLA_TESLA: { unmodelled: true },
  GP_JANE_DREW: { cityPerm: { housing: 4, amenities: 3 } },
  GP_JOHN_ROEBLING: { charges: 2, cityPerm: { housing: 2, amenities: 1 } },
  GP_SERGEI_KOROLEV: { spaceProduction: 1500 },
  GP_JOSEPH_PAXTON: { unmodelled: true },
  GP_CHARLES_CORREA: { cityPerm: { appeal: 2 } },
  GP_WERNHER_VON_BRAUN: { perm: { spaceProdPct: 100 } },
  GP_KENZO_TANGE: { unmodelled: true },

  // ---- MERCHANT: gold, envoys, trade capacity and invented luxuries ----
  GP_COLAEUS: { site: 'luxury', faith: 100, luxuryCopies: 1, luxuryAmenities: LUXURY_AMENITY_CITIES },
  GP_MARCUS_LICINIUS_CRASSUS: { site: 'adjacentOwn', charges: 3, gold: 60 },
  GP_ZHANG_QIAN: { perm: { tradeCapacity: 1 } },
  GP_IBN_FADLAN: { perm: { tradeCapacity: 1 } },
  GP_IRENE_OF_ATHENS: { site: 'luxury', perm: { tradeCapacity: 1 }, luxuryCopies: 1, luxuryAmenities: LUXURY_AMENITY_CITIES },
  GP_MARCO_POLO: { unit: 'TRADER', perm: { tradeCapacity: 1 } },
  GP_ZHOU_DAGUAN: { site: 'cityState', envoys: 3 },
  GP_JAKOB_FUGGER: { gold: 200, envoys: 2 },
  GP_RAJA_TODAR_MAL: { envoys: 1 },
  GP_ADAM_SMITH: { perm: { policySlotEconomic: 1 } },
  GP_JOHN_JACOB_ASTOR: { gold: 500, envoys: 2 },
  GP_JOHN_SPILSBURY: { luxuryCopies: 1, luxuryAmenities: 4 },
  GP_STAMFORD_RAFFLES: { unmodelled: true },
  GP_JOHN_ROCKEFELLER: { strategic: { resource: 'OIL', amount: 1 } },
  GP_SARAH_BREEDLOVE: { unmodelled: true },
  GP_MARY_KATHERINE_GODDARD: { unmodelled: true },
  GP_HELENA_RUBINSTEIN: { luxuryCopies: 2, luxuryAmenities: 4 },
  GP_LEVI_STRAUSS: { luxuryCopies: 2, luxuryAmenities: 4 },
  GP_MELITTA_BENTZ: { perm: { tradeCapacity: 1 } },
  GP_ESTEE_LAUDER: { luxuryCopies: 2, luxuryAmenities: 6 },
  GP_JAMSETJI_TATA: { siteDistrict: 'CAMPUS', unmodelled: true },
  GP_MASARU_IBUKA: { siteDistrict: 'INDUSTRIAL_ZONE', unmodelled: true },

  // ---- GENERAL: promotions, free units, and the war-weariness cut ----
  GP_BOUDICA: { unmodelled: true },
  GP_HANNIBAL_BARCA: { promotionLevels: 1 },
  GP_SUN_TZU: { greatWorkKind: 0 }, // GW_WRITING
  GP_TRUNG_TRAC: { perm: { warWearyPct: 25 } },
  GP_THELFLD: { unit: 'KNIGHT' },
  GP_EL_CID: { unmodelled: true },
  GP_GENGHIS_KHAN_UNIT: { promotionLevels: 1, xpPct: 25 },
  GP_TIMUR: { promotionLevels: 1, xpPct: 25 },
  GP_ANA_NZINGA: { envoys: 1 },
  GP_AMINA: { envoys: 1 },
  GP_GUSTAVUS_ADOLPHUS: { unit: 'BOMBARD', unitPromotions: 1 },
  GP_DANDARA: { unit: 'WARRIOR_MONK', unitPromotions: 1 }, // "Grants a Warrior Monk with one promotion level."
  GP_SIMON_BOLIVAR_UNIT: { envoys: 2 },
  GP_JOSE_DE_SAN_MARTIN: { envoys: 2 },
  GP_NAPOLEON_BONAPARTE: { unmodelled: true },
  GP_RANI_LAKSHMIBAI: { unit: 'CAVALRY', unitPromotions: 1 },
  GP_TUPAC_AMARU: { unmodelled: true },
  GP_JOHN_MONASH: { promotionLevels: 1, xpPct: 75 },
  GP_MARINA_RASKOVA: { siteDistrict: 'AERODROME', airSlotBonus: 1 },
  GP_SAMORI_TOURE: { unit: 'INFANTRY', unitPromotions: 1 },
  GP_DOUGLAS_MACARTHUR: { unit: 'TANK', unitPromotions: 1 },
  GP_DWIGHT_EISENHOWER: { perm: { unitProdPct: 5 } },
  GP_GEORGY_ZHUKOV: { perm: { flankPctLand: 50 } },
  GP_SUDIRMAN: { promotionLevels: 1, xpPct: 100 },
  GP_AHMAD_SHAH_MASSOUD: { unit: 'MODERN_AT', unitPromotions: 1 },
  GP_VIJAYA_WIMALARATNE: { promotionLevels: 1, xpPct: 100 },

  // ---- ADMIRAL: the same shape at sea, plus the plunder rewards ----
  GP_ARTEMISIA: { promotionLevels: 1 },
  GP_GAIUS_DUILIUS: { unmodelled: true },
  GP_THEMISTOCLES: { unit: 'QUADRIREME' },
  GP_HANNO_THE_NAVIGATOR: { unit: 'GALLEY' },
  GP_HIMERIOS: { promotionLevels: 1, xpPct: 25 },
  GP_LEIF_ERIKSON: { unmodelled: true },
  GP_RAJENDRA_CHOLA: { gold: 50 },
  GP_ZHENG_HE: { envoys: 1 },
  GP_FRANCIS_DRAKE: { gold: 75, perm: { routePlunderPct: 50 } },
  GP_SANTA_CRUZ: { unmodelled: true },
  GP_YI_SUN_SIN: { unit: 'IRONCLAD', unitPromotions: 1 },
  GP_FERDINAND_MAGELLAN: { cityPerm: { loyalty: 4 } },
  GP_CHING_SHIH: { gold: 100, perm: { routePlunderPct: 60 } },
  GP_HORATIO_NELSON: { siteDistrict: 'HARBOR', buildings: ['LIGHTHOUSE', 'SHIPYARD'], perm: { flankPctNaval: 50 } },
  GP_LASKARINA_BOUBOULINA: { promotionLevels: 1, xpPct: 50 },
  GP_MATTHEW_PERRY: { site: 'cityState', suzerainSeize: true },
  GP_FRANZ_VON_HIPPER: { unit: 'BATTLESHIP', unitPromotions: 1 },
  GP_JOAQUIM_MARQUES_LISBOA: { perm: { warWearyPct: 25 } },
  GP_TOGO_HEIHACHIRO: { promotionLevels: 1, xpPct: 75 },
  GP_CHESTER_NIMITZ: { perm: { unitProdPct: 20 } },
  GP_GRACE_HOPPER: { freeTechRandom: 1 },
  GP_SERGEI_GORSHKOV: { promotionLevels: 1, xpPct: 100 },
  GP_CLANCY_FERNANDO: { promotionLevels: 1, xpPct: 200 },
};

/** The class's own district is the default activation site; the art classes
 *  need a free Great Work slot and the two military classes may spend their
 *  charge anywhere. */
export function gpSiteOf(person: GreatPersonDef): { site: GpSite; district: DistrictId } {
  const a = GP_ABILITY[person.id];
  const dflt: GpSite = GW_WORK_CLASSES.has(person.class)
    ? 'gwSlot'
    : person.class === 'GENERAL' || person.class === 'ADMIRAL' ? 'anywhere' : 'district';
  return { site: a?.site ?? dflt, district: a?.siteDistrict ?? GP_CLASS_DISTRICT[person.class] };
}

export function gpChargesOf(person: GreatPersonDef): number {
  return GP_ABILITY[person.id]?.charges ?? 1;
}

/** What ONE charge pays out. A person with no sourced row — the four classes
 *  modelled in kind — and one whose whole clause has no carrier both fall back
 *  to the class lump the roster built. */
export function gpEffectOf(person: GreatPersonDef): GpEffect {
  const a = GP_ABILITY[person.id];
  return !a || a.unmodelled ? person.effect : a;
}
