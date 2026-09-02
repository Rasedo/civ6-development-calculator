/** The roster: every civilization-leader pair the install ships, one row
 *  each. The seeder draws a world's trio from it, so it lives in world/. */

/** CIV6 (Civilizations.xml): the install's civilizations — the first four
 *  are the developed ones, the rest wait on docs/ROSTER.md's clauses. */
export type CivId = 'ROME' | 'EGYPT' | 'NORWAY' | 'SUMERIA' | 'AMERICA' | 'ARABIA' | 'BRAZIL' | 'CANADA' | 'CHINA' | 'CREE' | 'ENGLAND' | 'FRANCE' | 'GEORGIA' | 'GERMANY' | 'GREECE' | 'HUNGARY' | 'INCA' | 'INDIA' | 'JAPAN' | 'KONGO' | 'KOREA' | 'MALI' | 'MAORI' | 'MAPUCHE' | 'MONGOLIA' | 'NETHERLANDS' | 'OTTOMAN' | 'PHOENICIA' | 'RUSSIA' | 'SCOTLAND' | 'SCYTHIA' | 'SPAIN' | 'SWEDEN' | 'ZULU';
export const CIV_IDS: readonly CivId[] = ['ROME', 'EGYPT', 'NORWAY', 'SUMERIA', 'AMERICA', 'ARABIA', 'BRAZIL', 'CANADA', 'CHINA', 'CREE', 'ENGLAND', 'FRANCE', 'GEORGIA', 'GERMANY', 'GREECE', 'HUNGARY', 'INCA', 'INDIA', 'JAPAN', 'KONGO', 'KOREA', 'MALI', 'MAORI', 'MAPUCHE', 'MONGOLIA', 'NETHERLANDS', 'OTTOMAN', 'PHOENICIA', 'RUSSIA', 'SCOTLAND', 'SCYTHIA', 'SPAIN', 'SWEDEN', 'ZULU'];
/** CIV6 (Leaders.xml): the leader each roster row plays — its leader
 *  ability is keyed here, never on the civilization, so a civilization with
 *  two leaders is two rows (`Seat.civ` indexes the ROW). */
export type LeaderId = 'TRAJAN' | 'CLEOPATRA' | 'HARDRADA' | 'GILGAMESH' | 'T_ROOSEVELT' | 'SALADIN' | 'PEDRO' | 'LAURIER' | 'QIN' | 'POUNDMAKER' | 'VICTORIA' | 'ELEANOR_ENGLAND' | 'CATHERINE_DE_MEDICI' | 'ELEANOR_FRANCE' | 'TAMAR' | 'BARBAROSSA' | 'GORGO' | 'PERICLES' | 'MATTHIAS_CORVINUS' | 'PACHACUTI' | 'GANDHI' | 'CHANDRAGUPTA' | 'HOJO' | 'MVEMBA' | 'SEONDEOK' | 'MANSA_MUSA' | 'KUPE' | 'LAUTARO' | 'GENGHIS_KHAN' | 'WILHELMINA' | 'SULEIMAN' | 'DIDO' | 'PETER_GREAT' | 'ROBERT_THE_BRUCE' | 'TOMYRIS' | 'PHILIP_II' | 'KRISTINA' | 'SHAKA';
export const CIV_LEADERS: { civ: CivId; leader: LeaderId; name: string; color: string; cityNames: string[] }[] = [
  { civ: 'ROME', leader: 'TRAJAN', name: 'Rome', color: '#8e3db8', cityNames: ['Roma', 'Ostia', 'Ravenna', 'Neapolis', 'Capua', 'Verona'] },
  { civ: 'EGYPT', leader: 'CLEOPATRA', name: 'Egypt', color: '#3db88e', cityNames: ['Thebes', 'Memphis', 'Giza', 'Elephantine', 'Sais', 'Tanis'] },
  { civ: 'NORWAY', leader: 'HARDRADA', name: 'Norway', color: '#3d6ab8', cityNames: ['Nidaros', 'Bergen', 'Oslo', 'Tunsberg', 'Hamar', 'Stavanger'] },
  { civ: 'SUMERIA', leader: 'GILGAMESH', name: 'Sumeria', color: '#b8823d', cityNames: ['Uruk', 'Ur', 'Eridu', 'Lagash', 'Nippur', 'Kish'] },
  { civ: 'AMERICA', leader: 'T_ROOSEVELT', name: 'America', color: '#33b19c', cityNames: ['Washington', 'New York', 'Philadelphia', 'Boston', 'Baltimore', 'Charleston', 'New Orleans', 'Cincinnati'] },
  { civ: 'ARABIA', leader: 'SALADIN', name: 'Arabia', color: '#b17733', cityNames: ['Mecca', 'Cairo', 'Medina', 'Damascus', 'Baghdad', 'Aleppo', 'Sanaa', 'Hattin'] },
  { civ: 'BRAZIL', leader: 'PEDRO', name: 'Brazil', color: '#5333b1', cityNames: ['Rio De Janeiro', 'Sao Paulo', 'Salvador', 'Brasilia', 'Fortaleza', 'Manaus', 'Curitiba', 'Recife'] },
  { civ: 'CANADA', leader: 'LAURIER', name: 'Canada', color: '#39b133', cityNames: ['Ottawa', 'Montreal', 'Toronto', 'Quebec City', 'Hamilton', 'Winnipeg', 'Halifax', 'Saint John'] },
  { civ: 'CHINA', leader: 'QIN', name: 'China', color: '#b1335d', cityNames: ['Xian', 'Beijing', 'Taiyuan', 'Chengdu', 'Jiaodong', 'Changsha', 'Longxi', 'Guangzhou'] },
  { civ: 'CREE', leader: 'POUNDMAKER', name: 'Cree', color: '#3382b1', cityNames: ['Mikisiw Wacihk', 'Ahtahkakoop', 'Pihtokahanapiwiyin', 'Mistahi Sipihk', 'Mistawasis', 'Wihkasko Kiseyin', 'Makwa Sakahikan', 'Maskotew'] },
  { civ: 'ENGLAND', leader: 'VICTORIA', name: 'England (Victoria)', color: '#a7b133', cityNames: ['London', 'Liverpool', 'Manchester', 'Birmingham', 'Leeds', 'Sheffield', 'Bristol', 'Plymouth'] },
  { civ: 'ENGLAND', leader: 'ELEANOR_ENGLAND', name: 'England (Eleanor England)', color: '#9733b1', cityNames: ['London', 'Liverpool', 'Manchester', 'Birmingham', 'Leeds', 'Sheffield', 'Bristol', 'Plymouth'] },
  { civ: 'FRANCE', leader: 'CATHERINE_DE_MEDICI', name: 'France (Catherine De Medici)', color: '#33b172', cityNames: ['Paris', 'Lyon', 'Rouen', 'Bordeaux', 'Marseille', 'Toulouse', 'La Rochelle', 'Amboise'] },
  { civ: 'FRANCE', leader: 'ELEANOR_FRANCE', name: 'France (Eleanor France)', color: '#b14d33', cityNames: ['Paris', 'Lyon', 'Rouen', 'Bordeaux', 'Marseille', 'Toulouse', 'La Rochelle', 'Amboise'] },
  { civ: 'GEORGIA', leader: 'TAMAR', name: 'Georgia', color: '#333eb1', cityNames: ['Tbilisi', 'Kutaisi', 'Batumi', 'Rustavi', 'Tskhumi', 'Gori', 'Telavi', 'Poti'] },
  { civ: 'GERMANY', leader: 'BARBAROSSA', name: 'Germany', color: '#63b133', cityNames: ['Berlin', 'Cologne', 'Frankfurt', 'Aachen', 'Magdeburg', 'Mainz', 'Heidelberg', 'Trier'] },
  { civ: 'GREECE', leader: 'GORGO', name: 'Greece (Gorgo)', color: '#b13388', cityNames: ['Athens', 'Sparta', 'Corinth', 'Ephesus', 'Argos', 'Knossos', 'Mycenae', 'Pharsalos'] },
  { civ: 'GREECE', leader: 'PERICLES', name: 'Greece (Pericles)', color: '#33acb1', cityNames: ['Athens', 'Sparta', 'Corinth', 'Ephesus', 'Argos', 'Knossos', 'Mycenae', 'Pharsalos'] },
  { civ: 'HUNGARY', leader: 'MATTHIAS_CORVINUS', name: 'Hungary', color: '#b19133', cityNames: ['Buda', 'Debrecen', 'Esztergom', 'Pecs', 'Szeged', 'Pest', 'Eger', 'Miskolc'] },
  { civ: 'INCA', leader: 'PACHACUTI', name: 'Inca', color: '#6d33b1', cityNames: ['Qusqu', 'Antawaylla', 'Wanuku', 'Willka Waman', 'Machu', 'Ollantaytambo', 'Sausa', 'Kashamarka'] },
  { civ: 'INDIA', leader: 'GANDHI', name: 'India (Gandhi)', color: '#33b148', cityNames: ['Delhi', 'Mumbai', 'Calcutta', 'Agra', 'Madurai', 'Chennai', 'Patna', 'Hyderabad'] },
  { civ: 'INDIA', leader: 'CHANDRAGUPTA', name: 'India (Chandragupta)', color: '#b13343', cityNames: ['Delhi', 'Mumbai', 'Calcutta', 'Agra', 'Madurai', 'Chennai', 'Patna', 'Hyderabad'] },
  { civ: 'JAPAN', leader: 'HOJO', name: 'Japan', color: '#3368b1', cityNames: ['Kyoto', 'Tokyo', 'Osaka', 'Nagoya', 'Fukuoka', 'Sendai', 'Shizuoka', 'Okayama'] },
  { civ: 'KONGO', leader: 'MVEMBA', name: 'Kongo', color: '#8db133', cityNames: ['Mbanza Kongo', 'Mbumbi', 'Mbamba', 'Mbanza Nsundi', 'Mbwila', 'Mpinda', 'Kwila', 'Mbanza Mbata'] },
  { civ: 'KOREA', leader: 'SEONDEOK', name: 'Korea', color: '#b133b1', cityNames: ['Gyeongju', 'Gwangju', 'Jeonju', 'Jinju', 'Chuncheon', 'Yangsan', 'Gangneung', 'Seoul'] },
  { civ: 'MALI', leader: 'MANSA_MUSA', name: 'Mali', color: '#33b18c', cityNames: ['Niani', 'Timbuktu', 'Jenne', 'Gao', 'Kumbi Saleh', 'Walata', 'Tawdenni', 'Tadmekka'] },
  { civ: 'MAORI', leader: 'KUPE', name: 'Maori', color: '#b16733', cityNames: ['Te Hokianga Nu A Kupe', 'Ngaruawahia', 'Opango', 'Whakarewarewa', 'Kaiapoi', 'Whanganui', 'Kawhia', 'Taumutu'] },
  { civ: 'MAPUCHE', leader: 'LAUTARO', name: 'Mapuche', color: '#4233b1', cityNames: ['Ngulu Mapu', 'Puel Mapu', 'Pikun Mapu', 'Nag Mapu', 'Willi Mapu', 'Pewen Mapu', 'Wente Mapu', 'Huilli Mapu'] },
  { civ: 'MONGOLIA', leader: 'GENGHIS_KHAN', name: 'Mongolia', color: '#49b133', cityNames: ['Qaraqorum', 'Ulaanbaatar', 'Urumqi', 'Kookeqota', 'Aksu', 'Almaliq', 'Qaraqoto', 'Choir'] },
  { civ: 'NETHERLANDS', leader: 'WILHELMINA', name: 'Netherlands', color: '#b1336d', cityNames: ['Amsterdam', 'Rotterdam', 'The Hague', 'Utrecht', 'Haarlem', 'Groningen', 'Eindhoven', 'Nijmegen'] },
  { civ: 'OTTOMAN', leader: 'SULEIMAN', name: 'Ottoman', color: '#3392b1', cityNames: ['Istanbul', 'Bursa', 'Edirne', 'Ankara', 'Halep', 'Konya', 'Adana', 'Trabzon'] },
  { civ: 'PHOENICIA', leader: 'DIDO', name: 'Phoenicia', color: '#b1ac33', cityNames: ['Tyre', 'Byblos', 'Sidon', 'Biruta', 'Ugarit', 'Kty', 'Aynook', 'Lpqy'] },
  { civ: 'RUSSIA', leader: 'PETER_GREAT', name: 'Russia', color: '#8733b1', cityNames: ['St Petersburg', 'Moscow', 'Novgorod', 'Kazan', 'Astrakhan', 'Yaroslavl', 'Smolensk', 'Voronezh'] },
  { civ: 'SCOTLAND', leader: 'ROBERT_THE_BRUCE', name: 'Scotland', color: '#33b162', cityNames: ['Stirling', 'Edinburgh', 'Aberdeen', 'Roxburgh', 'Haddington', 'Dumfries', 'Dundee', 'Ayr'] },
  { civ: 'SCYTHIA', leader: 'TOMYRIS', name: 'Scythia', color: '#b13d33', cityNames: ['Pokrovka', 'Issyk', 'Kul Oba', 'Gelonus', 'Pazyryk', 'Chertomlyk', 'Neapolis', 'Kostromskaya'] },
  { civ: 'SPAIN', leader: 'PHILIP_II', name: 'Spain', color: '#334eb1', cityNames: ['Madrid', 'Seville', 'Barcelona', 'Toledo', 'Cordoba', 'Valencia', 'Zaragoza', 'Valladolid'] },
  { civ: 'SWEDEN', leader: 'KRISTINA', name: 'Sweden', color: '#73b133', cityNames: ['Stockholm', 'Goteborg', 'Uppsala', 'Linkoping', 'Orebro', 'Vasteras', 'Jonkoping', 'Norrkoping'] },
  { civ: 'ZULU', leader: 'SHAKA', name: 'Zulu', color: '#b13398', cityNames: ['Ulundi', 'Umgungundlovu', 'Nobamba', 'Bulawayo', 'Kwadukuza', 'Nongoma', 'Ondini', 'Nodwengu'] },
];
