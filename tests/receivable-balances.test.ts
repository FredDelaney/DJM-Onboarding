import assert from "node:assert/strict";
import test from "node:test";
import { receivableBalances } from "../lib/receivable-balances.ts";

test("collection totals stay separate for each recorded currency, including cents", () => {
  assert.deepEqual(
    receivableBalances([
      { currency: "EUR", balance: "100.25" },
      { currency: " eur ", balance: 99.75 },
      { currency: "USD", balance: 10.5 },
      { currency: "NZD", balance: 0 },
    ]),
    {
      balances: [
        { currency: "EUR", amount: 200 },
        { currency: "USD", amount: 10.5 },
        { currency: "NZD", amount: 0 },
      ],
      unrecorded: 0,
    },
  );
});
test("missing balances never become zero and missing currency never becomes EUR", () => {
  assert.deepEqual(
    receivableBalances([
      { currency: "EUR", balance: null },
      { currency: "USD", balance: "" },
      { balance: 10 },
      { currency: "bad-code", balance: 5 },
      { currency: "EUR", balance: Infinity },
    ]),
    { balances: [{ currency: "", amount: 15 }], unrecorded: 3 },
  );
});
test("no receivables is distinct from a recorded zero balance", () => {
  assert.deepEqual(receivableBalances([]), { balances: [], unrecorded: 0 });
  assert.deepEqual(receivableBalances([{ currency: "EUR", balance: "0" }]), {
    balances: [{ currency: "EUR", amount: 0 }],
    unrecorded: 0,
  });
});
