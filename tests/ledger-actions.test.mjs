import assert from "node:assert/strict";
import test from "node:test";
import { putExpense, removeExpenses } from "../frontend/ledger-actions.ts";
import { calculateTrip } from "../frontend/trip-utils.ts";
const trip = () => ({
  id: "t",
  title: "旅程",
  dates: "",
  members: [
    { id: "a", name: "甲" },
    { id: "b", name: "乙" },
  ],
  sharedExpenses: [],
  travelCosts: [],
  personalExpenses: [],
});
const form = () => ({
  kind: "shared",
  title: "酒店",
  amount: "200.00",
  category: "住宿",
  payerId: "a",
  participantIds: ["a", "b"],
  memberId: "a",
  date: "2026-10-20",
  note: "",
});
test("mini program entries use the same settlement calculation as H5", () => {
  let current = putExpense(trip(), form());
  current = putExpense(current, {
    ...form(),
    kind: "travel",
    title: "车票",
    amount: "100",
  });
  current = putExpense(current, {
    ...form(),
    kind: "personal",
    title: "餐食",
    amount: "30",
  });
  const total = calculateTrip(current);
  assert.deepEqual(
    total.memberTotals.map((m) => m.total),
    [-20, 150],
  );
  assert.equal(total.expenseTotal, 330);
  const edited = putExpense(current, {
    ...form(),
    id: current.sharedExpenses[0].id,
    amount: "240",
  });
  assert.equal(edited.sharedExpenses.length, 1);
  assert.equal(edited.sharedExpenses[0].amount, 240);
  assert.equal(current.sharedExpenses[0].amount, 200);
  assert.equal(
    removeExpenses(edited, "shared", [edited.sharedExpenses[0].id])
      .sharedExpenses.length,
    0,
  );
});
test("rejects invalid money, missing participants and unknown payers", () => {
  for (const amount of ["0", "-1", "NaN", "Infinity", "1.001", "1e3", ""])
    assert.throws(() => putExpense(trip(), { ...form(), amount }));
  assert.throws(
    () => putExpense(trip(), { ...form(), participantIds: [] }),
    /分摊人员/,
  );
  assert.throws(
    () => putExpense(trip(), { ...form(), payerId: "stranger" }),
    /付款人/,
  );
  assert.throws(
    () =>
      putExpense(trip(), { ...form(), kind: "personal", memberId: "stranger" }),
    /归属人员/,
  );
  assert.deepEqual(
    putExpense(trip(), { ...form(), participantIds: ["a", "a", "unknown"] })
      .sharedExpenses[0].participantIds,
    ["a"],
  );
});
