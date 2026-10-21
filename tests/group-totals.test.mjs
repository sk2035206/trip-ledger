import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateTrip,
  getGroupCategoryTotals,
} from "../frontend/trip-utils.ts";

function fixture() {
  return {
    id: "group",
    title: "组合结算",
    dates: "",
    members: [
      { id: "a", name: "甲" },
      { id: "b", name: "乙" },
      { id: "c", name: "丙" },
    ],
    sharedExpenses: [
      {
        id: "hotel",
        title: "酒店",
        category: "住宿",
        amount: 300,
        payerId: "a",
        participantIds: ["a", "b", "c"],
      },
      {
        id: "food",
        title: "午餐",
        category: "餐饮",
        amount: 120,
        participantIds: ["a", "b", "c"],
      },
    ],
    travelCosts: [
      { id: "train", title: "车票", amount: 90, participantIds: ["a", "b"] },
    ],
    personalExpenses: [
      { id: "p1", title: "伴手礼", amount: 20, memberId: "a" },
      { id: "p2", title: "个人餐食", amount: 30, memberId: "c" },
    ],
  };
}
test("group categories include each member's shares, personal costs and negative payer credits", () => {
  const trip = fixture();
  const categories = Object.fromEntries(
    getGroupCategoryTotals(trip, ["a", "b"]).map((item) => [
      item.label,
      item.amount,
    ]),
  );
  assert.deepEqual(categories, { 住宿: -100, 餐饮: 80, 出行: 90, 个人: 20 });
  const expected = calculateTrip(trip)
    .memberTotals.filter((item) => ["a", "b"].includes(item.member.id))
    .reduce((sum, item) => sum + item.total, 0);
  assert.equal(
    Object.values(categories).reduce((sum, amount) => sum + amount, 0),
    expected,
  );
  assert.equal(expected, 90);
});
test("every selection reconciles to member payable totals, including overpaid groups", () => {
  const trip = fixture();
  const totals = calculateTrip(trip).memberTotals;
  for (const ids of [["a"], ["b"], ["c"], ["a", "c"], ["a", "b", "c"]]) {
    const categories = getGroupCategoryTotals(trip, ids);
    assert.equal(
      categories.reduce((sum, item) => sum + item.amount, 0),
      totals
        .filter((item) => ids.includes(item.member.id))
        .reduce((sum, item) => sum + item.total, 0),
    );
  }
  assert.equal(
    getGroupCategoryTotals(trip, ["a"]).reduce(
      (sum, item) => sum + item.amount,
      0,
    ),
    -95,
  );
});
test("duplicate or unknown member IDs do not inflate group categories", () => {
  const trip = fixture();
  assert.deepEqual(
    getGroupCategoryTotals(trip, ["a", "a", "unknown"]),
    getGroupCategoryTotals(trip, ["a"]),
  );
  assert.deepEqual(getGroupCategoryTotals(trip, []), []);
  assert.deepEqual(getGroupCategoryTotals(trip, ["unknown"]), []);
});
