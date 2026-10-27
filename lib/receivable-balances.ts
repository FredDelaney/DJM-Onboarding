import { hasRecordedNumber } from "./recorded-number.ts";

/** A collection balance is meaningful only within its recorded currency. */
export function receivableBalances(
  items: readonly { balance?: unknown; currency?: unknown }[],
) {
  const totals = new Map<string, number>();
  let unrecorded = 0;
  for (const item of items) {
    if (!hasRecordedNumber(item.balance)) {
      unrecorded++;
      continue;
    }
    const value =
      typeof item.currency === "string"
        ? item.currency.trim().toUpperCase()
        : "";
    const currency = /^[A-Z]{3}$/.test(value) ? value : "";
    totals.set(currency, (totals.get(currency) || 0) + Number(item.balance));
  }
  return {
    balances: [...totals].map(([currency, amount]) => ({ currency, amount })),
    unrecorded,
  };
}
