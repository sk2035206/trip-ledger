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
import { parseLedgerImportText, resolveLedgerImportCategory } from "../frontend/ledger-import.ts";
import { normalizeBillTime, toBillTimeInputValue } from "../frontend/bill-time.ts";

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

test("normalizes legacy shared expense bill times while loading state", () => {
  const state = normalizeAppState({
    people: [{ id: "a", name: "甲" }],
    categories: ["其他"],
    trips: [
      {
        id: "trip-time",
        title: "账单时间测试",
        dates: "2026",
        members: [{ id: "a", name: "甲" }],
        sharedExpenses: [
          {
            id: "shared-time",
            title: "测试费用",
            category: "其他",
            amount: 10,
            billTime: "2025年5月6日 7:08",
            participantIds: ["a"],
          },
        ],
        travelCosts: [],
        personalExpenses: [],
      },
    ],
  });

  assert.equal(state.trips[0].sharedExpenses[0].billTime, "2025-05-06");
});

test("parses screenshot ledger text into import drafts", () => {
  const text = `
5月16日 星期六
支409.65
打车出行 支付宝自动记账
17:27 | 滴滴出行-黄山北 -70.07
景点门票 微信自动记账
16:00 | 携程-齐云山索道 -180.00
酒店住宿 支付宝自动记账
14:38 | 华住-全季-齐云山 -261.32
`;

  const drafts = parseLedgerImportText(text, ["酒店", "吃玩", "交通", "门票", "其他"], 2026);

  assert.equal(drafts.length, 3);
  assert.deepEqual(
    drafts.map((draft) => [draft.title, draft.category, draft.amount, draft.billTime]),
    [
      ["滴滴出行-黄山北", "交通", 70.07, "2026-05-16"],
      ["携程-齐云山索道", "门票", 180, "2026-05-16"],
      ["华住-全季-齐云山", "酒店", 261.32, "2026-05-16"],
    ],
  );
  assert.equal(drafts[0].note, "");
});

test("joins OCR item rows with following low-contrast time and note rows", () => {
  const text = `
5月16日 星期六                       文409.65
一“打车出行 支付宝自动记账         -70 07
”17:27 1 滴滴出行-黄山北
景点门票 谷信自动记账             -180.00
16:00 | 携程-齐云山索道
”打车出行 “支付宝自动记账]         -3038
”10:46 1 滴滴出行-齐云山
景点门票 支付宝自动记由             _12920
一“09:33 | 同程-齐云山
5月15日 星期五                       支36.77
”打车出行 支付宝自动记帐]           -3677
21:34 | 滴滴出行-齐云山-全季
5月13日 星期三                       支555.32
旅行交通“支付宝自动记账             -294 00
18:11 | 中国铁路-黄山北-杭州西
`;

  const drafts = parseLedgerImportText(text, ["酒店", "吃玩", "交通", "门票", "其他"], 2026);

  assert.deepEqual(
    drafts.map((draft) => [draft.title, draft.amount, draft.billTime, draft.note]),
    [
      ["滴滴出行-黄山北", 70.07, "2026-05-16", ""],
      ["携程-齐云山索道", 180, "2026-05-16", ""],
      ["滴滴出行-齐云山", 30.38, "2026-05-16", ""],
      ["同程-齐云山", 129.2, "2026-05-16", ""],
      ["滴滴出行-齐云山-全季", 36.77, "2026-05-15", ""],
      ["中国铁路-黄山北-杭州西", 294, "2026-05-13", ""],
    ],
  );
});

test("normalizes bill date and fills a missing year", () => {
  assert.equal(normalizeBillTime("5月6日 7:08", 2026), "2026-05-06");
  assert.equal(normalizeBillTime("2025年12月9日 18:30", 2026), "2025-12-09");
  assert.equal(normalizeBillTime("2025-12-09T18:30", 2026), "2025-12-09");
  assert.equal(toBillTimeInputValue("2025-12-09 18:30"), "2025-12-09");
});

test("defaults unmatched import categories to other", () => {
  assert.equal(resolveLedgerImportCategory("纪念购物", "不明商家", ["酒店", "吃玩", "交通", "门票", "其他"]), "其他");
  assert.equal(resolveLedgerImportCategory("美食特产", "醉湘楼", ["酒店", "吃玩", "交通", "门票", "其他"]), "吃玩");
});
