import type { Trip, SharedExpense } from "./trip-types";
import { normalizeBillTime } from "./bill-time";
import { uid } from "./trip-utils";

export type ExpenseKind = "shared" | "travel" | "personal";
export type ExpenseDraft = {
  kind: ExpenseKind;
  id?: string;
  title: string;
  amount: string;
  category: string;
  payerId: string;
  participantIds: string[];
  memberId: string;
  date: string;
  note: string;
};
export const expenseKeys = {
  shared: "sharedExpenses",
  travel: "travelCosts",
  personal: "personalExpenses",
} as const;
export function validAmount(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim()))
    throw new Error("金额须为大于零、最多两位小数的数字");
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99)
    throw new Error("金额超出允许范围");
  return amount;
}
export function putExpense(trip: Trip, draft: ExpenseDraft): Trip {
  const title = draft.title.trim();
  if (!title) throw new Error("请填写费用事项");
  const amount = validAmount(draft.amount);
  const participants = [...new Set(draft.participantIds)].filter((id) =>
    trip.members.some((m) => m.id === id),
  );
  if (draft.kind !== "personal" && !participants.length)
    throw new Error("请选择参与分摊人员");
  if (
    draft.kind === "personal" &&
    !trip.members.some((m) => m.id === draft.memberId)
  )
    throw new Error("请选择费用归属人员");
  if (draft.kind === "shared" && !draft.category.trim())
    throw new Error("请选择公共费用类别");
  if (
    draft.kind === "shared" &&
    draft.payerId &&
    !trip.members.some((m) => m.id === draft.payerId)
  )
    throw new Error("付款人不在当前账单中");
  const common = {
    id: draft.id || uid(draft.kind),
    title,
    amount,
    note: draft.note.trim(),
  };
  const date = draft.date ? normalizeBillTime(draft.date) : undefined;
  if (draft.date && !date) throw new Error("费用日期格式不正确");
  if (draft.kind === "shared") {
    const entry: SharedExpense = {
      ...common,
      category: draft.category,
      payerId: draft.payerId || undefined,
      billTime: date,
      participantIds: participants,
    };
    return {
      ...trip,
      sharedExpenses: draft.id
        ? trip.sharedExpenses.map((e) => (e.id === draft.id ? entry : e))
        : [...trip.sharedExpenses, entry],
    };
  }
  if (draft.kind === "travel") {
    const entry = { ...common, participantIds: participants };
    return {
      ...trip,
      travelCosts: draft.id
        ? trip.travelCosts.map((e) => (e.id === draft.id ? entry : e))
        : [...trip.travelCosts, entry],
    };
  }
  const entry = { ...common, memberId: draft.memberId, date };
  return {
    ...trip,
    personalExpenses: draft.id
      ? trip.personalExpenses.map((e) => (e.id === draft.id ? entry : e))
      : [...trip.personalExpenses, entry],
  };
}
export function removeExpenses(
  trip: Trip,
  kind: ExpenseKind,
  ids: string[],
): Trip {
  const key = expenseKeys[kind];
  return {
    ...trip,
    [key]: trip[key].filter((entry) => !ids.includes(entry.id)),
  };
}
