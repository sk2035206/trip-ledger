import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateTrip,
  getTripCategoryTotals,
  getTripExpenseTypeTotals,
} from "../frontend/trip-utils.ts";

test("self-paid adjustments reduce member payable without changing expense totals or categories", () => {
  const trip = {
    id: "trip-test",
    title: "测试出行",
    dates: "2026",
    members: [
      { id: "a", name: "甲" },
      { id: "b", name: "乙" },
    ],
    sharedExpenses: [
      {
        id: "shared-1",
        title: "酒店",
        category: "酒店",
        amount: 200,
        participantIds: ["a", "b"],
      },
    ],
    travelCosts: [
      {
        id: "travel-1",
        title: "车票",
        amount: 100,
        participantIds: ["a", "b"],
      },
    ],
    personalExpenses: [
      {
        id: "personal-1",
        memberId: "a",
        title: "个人餐食",
        amount: 30,
      },
    ],
    adjustments: [
      {
        id: "adjust-1",
        memberId: "a",
        title: "自付酒店",
        amount: -80,
      },
    ],
  };

  const total = calculateTrip(trip);

  assert.equal(total.sharedTotal, 200);
  assert.equal(total.travelTotal, 100);
  assert.equal(total.personalTotal, 30);
  assert.equal(total.adjustmentTotal, -80);
  assert.equal(total.finalTotal, 330);
  assert.equal(total.expenseTotal, 330);
  assert.equal(total.payableTotal, 250);
  assert.deepEqual(getTripCategoryTotals(trip), [{ label: "酒店", amount: 200 }]);
  assert.deepEqual(getTripExpenseTypeTotals(trip), [
    { label: "公共", amount: 200 },
    { label: "出行", amount: 100 },
    { label: "个人", amount: 30 },
  ]);
  assert.equal(total.memberTotals.find((item) => item.member.id === "a")?.total, 100);
  assert.equal(total.memberTotals.find((item) => item.member.id === "b")?.total, 150);
});

test("shared expense payer reduces payable without duplicate adjustment entry", () => {
  const trip = {
    id: "trip-payer",
    title: "付款人测试",
    dates: "2026",
    members: [
      { id: "a", name: "甲" },
      { id: "b", name: "乙" },
    ],
    sharedExpenses: [
      {
        id: "shared-payer",
        title: "酒店",
        category: "酒店",
        amount: 200,
        payerId: "a",
        participantIds: ["a", "b"],
      },
    ],
    travelCosts: [],
    personalExpenses: [],
    adjustments: [],
  };

  const total = calculateTrip(trip);

  assert.equal(total.sharedTotal, 200);
  assert.equal(total.paidTotal, 200);
  assert.equal(total.adjustmentTotal, 0);
  assert.equal(total.finalTotal, 200);
  assert.equal(total.payableTotal, 0);
  assert.equal(total.memberTotals.find((item) => item.member.id === "a")?.paid, 200);
  assert.equal(total.memberTotals.find((item) => item.member.id === "a")?.total, -100);
  assert.equal(total.memberTotals.find((item) => item.member.id === "b")?.total, 100);
});
