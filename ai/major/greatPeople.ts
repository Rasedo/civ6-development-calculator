/**
 * THE MAJORS' GREAT PEOPLE AI: the patronage (AI::Economic, AI::Religious;
 * `tools/civ6lab/dll_readings.md` "C-97: the great people's patronage").
 *
 * THE GOLD PATRONAGE (0x6898b0, the close of the savings turn 0x687bf0):
 * over the Great Person classes in the GreatPersonClasses table's order, a
 * person the player may claim is claimed (the engine's claim) and ends the
 * turn; else, among the persons it may patronize with Gold (0x2f26c0), the
 * cheapest whose price the SLUSH_FUND and GREAT_PEOPLE savings together
 * exceed and the GREAT_PEOPLE savings alone exceed half of (@d20458 0.5),
 * patronized, the price spent from the GREAT_PEOPLE slot.
 *
 * THE FAITH PATRONAGE (0x751590, the religion AI's turn 0x74fbf0 after its
 * purchases 0x74de60): the cheapest person it may patronize with Faith whose
 * price its Faith exceeds.
 *
 * Both also ask that the person can act on some plot the player has
 * revealed (0x561070, the activation's test over every plot). The AI never
 * passes on a person: the reject (0x2f8c00) is called by the player's
 * operation alone.
 */
import { AI_GREAT_PERSON_CLASSES } from './tables';
import type { MajorView } from './view';
import { FX } from '../../cpu/core/aiValue';
import { senderOf, type DiploActionMemory } from './diploActions';
import { SLOT_GREAT_PEOPLE, SLOT_SLUSH, spend } from '../../cpu/core/aiEconomic';

/** the share of a Gold patronage's price the GREAT_PEOPLE savings must
 *  exceed (0x6898b0: @d20458) */
const GOLD_PATRONAGE_SAVED = FX / 2;

/** THE GOLD PATRONAGE (0x6898b0): the class patronized, its price spent from
 *  the savings; null for none */
export function goldPatronage(view: MajorView, mem: DiploActionMemory, seat: number): string | null {
  const s = senderOf(mem, seat);
  let best: string | null = null;
  let bestCost = -1;
  for (const cls of AI_GREAT_PERSON_CLASSES) {
    const price = view.greatPersonPatronage(seat, cls, 'gold');
    if (price < 0) continue;
    const cost = Math.trunc(price) * FX;
    if (best !== null && cost >= bestCost) continue;
    if (s.savings[SLOT_SLUSH] + s.savings[SLOT_GREAT_PEOPLE] <= cost) continue;
    if (s.savings[SLOT_GREAT_PEOPLE] <= (cost * GOLD_PATRONAGE_SAVED) >> 8) continue;
    if (!view.greatPersonUsable(seat, cls)) continue;
    best = cls;
    bestCost = cost;
  }
  if (best !== null) spend(s, bestCost, SLOT_GREAT_PEOPLE);
  return best;
}

/** THE FAITH PATRONAGE (0x751590): the class patronized; null for none */
export function faithPatronage(view: MajorView, seat: number): string | null {
  const faith = Math.trunc(view.faith(seat) * FX);
  let best: string | null = null;
  let bestCost = -1;
  for (const cls of AI_GREAT_PERSON_CLASSES) {
    const price = view.greatPersonPatronage(seat, cls, 'faith');
    if (price < 0) continue;
    const cost = Math.trunc(price) * FX;
    if (best !== null && cost >= bestCost) continue;
    if (faith <= cost) continue;
    if (!view.greatPersonUsable(seat, cls)) continue;
    best = cls;
    bestCost = cost;
  }
  return best;
}
