"use client";

import { createContext, useContext } from "react";
import type { ISODate } from "@/lib/dates";
import type { Account, OneTimeTransaction } from "@/lib/engine";

/**
 * Your transactions, for drilling from a category's list into one name's history (the same view a
 * transaction has in Activity). Pop-ups that list spending read it from here.
 */
export interface TxnDrill {
  txns: OneTimeTransaction[];
  today: ISODate;
  accountName: (id: string) => string;
}

const Ctx = createContext<TxnDrill | null>(null);

export function TxnDrillProvider({ txns, accounts, today, children }: { txns: OneTimeTransaction[]; accounts: Account[]; today: ISODate; children: React.ReactNode }) {
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "Deleted account";
  return <Ctx.Provider value={{ txns, today, accountName }}>{children}</Ctx.Provider>;
}

export const useTxnDrill = () => useContext(Ctx);
