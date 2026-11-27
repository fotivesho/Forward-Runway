import type { ISODate } from "../dates";
import { cardRoomFor, type CardRoomResult } from "../engine";
import { toEngineInput, type Snapshot } from "../data/snapshot";

export type CardRoom = CardRoomResult;

/** The max card bill for this card's next bills: the one calculation What if uses too. */
export function cardRoom(s: Snapshot, today: ISODate, accountId: string): CardRoom[] {
  return cardRoomFor(toEngineInput(s, today), accountId);
}
