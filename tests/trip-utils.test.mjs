import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateTrip,
  createReadableId,
  getTripCategoryTotals,
  getTripExpenseTypeTotals,
  normalizeAppState,
  toPinyinSlug,
} from "../frontend/trip-utils.ts";

test("personal expenses are included in member payable without affecting public categories", () => {
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
  };

  const total = calculateTrip(trip);

  assert.equal(total.sharedTotal, 200);
  assert.equal(total.travelTotal, 100);
  assert.equal(total.personalTotal, 30);
  assert.equal(total.finalTotal, 330);
  assert.equal(total.expenseTotal, 330);
  assert.equal(total.payableTotal, 330);
  assert.deepEqual(getTripCategoryTotals(trip), [{ label: "酒店", amount: 200 }]);
  assert.deepEqual(getTripExpenseTypeTotals(trip), [
    { label: "公共", amount: 200 },
    { label: "出行", amount: 100 },
    { label: "个人", amount: 30 },
  ]);
  assert.equal(total.memberTotals.find((item) => item.member.id === "a")?.total, 180);
  assert.equal(total.memberTotals.find((item) => item.member.id === "b")?.total, 150);
});

test("shared expense payer reduces payable without a duplicate self-paid entry", () => {
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
  };

  const total = calculateTrip(trip);

  assert.equal(total.sharedTotal, 200);
  assert.equal(total.paidTotal, 200);
  assert.equal(total.finalTotal, 200);
  assert.equal(total.payableTotal, 0);
  assert.equal(total.memberTotals.find((item) => item.member.id === "a")?.paid, 200);
  assert.equal(total.memberTotals.find((item) => item.member.id === "a")?.total, -100);
  assert.equal(total.memberTotals.find((item) => item.member.id === "b")?.total, 100);
});

test("Chinese names and trip titles create readable, unique pinyin IDs", () => {
  assert.equal(toPinyinSlug("开琼"), "kaiq");
  assert.equal(toPinyinSlug("2026秦皇岛游玩费用"), "2026-qinhdywfy");
  assert.equal(createReadableId("开琼", ["kaiq"]), "kaiq-2");
});

test("normalizes current trips without the removed adjustments collection", () => {
  const state = normalizeAppState({
    people: [{ id: "a", name: "甲" }],
    categories: ["其他"],
    trips: [
      {
        id: "trip-test",
        title: "测试账单",
        dates: "2026-08",
        members: [{ id: "a", name: "甲" }],
        sharedExpenses: [],
        travelCosts: [],
        personalExpenses: [],
      },
    ],
  });

  assert.equal(state.trips[0].title, "测试账单");
  assert.deepEqual(state.trips[0].sharedExpenses, []);
});
