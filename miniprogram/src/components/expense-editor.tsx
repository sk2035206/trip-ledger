import { useRef, useState } from "react";
import { Text, View } from "@tarojs/components";
import type { AppState, Trip } from "@ledger/trip-types";
import {
  expenseKeys,
  putExpense,
  type ExpenseDraft,
  type ExpenseKind,
} from "@ledger/ledger-actions";
import { formatMoney, uid } from "@ledger/trip-utils";
import {
  parseLedgerImportText,
  type LedgerImportDraft,
} from "@ledger/ledger-import";
import {
  Action,
  DateField,
  Field,
  MemberChoices,
  Select,
  Sheet,
  Empty,
  closeForm,
} from "./ui";
import { notify, saveChange, updateTrip } from "../lib/store";

const labels = { shared: "公共费用", travel: "出行费用", personal: "个人费用" };
export function ExpenseEditor({
  trip,
  categories,
  kind,
  id,
  onClose,
}: {
  trip: Trip;
  categories: string[];
  kind: ExpenseKind;
  id?: string;
  onClose: () => void;
}) {
  const entry = trip[expenseKeys[kind]].find((e) => e.id === id);
  const [form, setForm] = useState<ExpenseDraft>({
    kind,
    id,
    title: entry?.title ?? "",
    amount: entry ? String(entry.amount) : "",
    note: entry?.note ?? "",
    category:
      entry && "category" in entry ? entry.category : (categories[0] ?? "其他"),
    payerId: entry && "payerId" in entry ? (entry.payerId ?? "") : "",
    participantIds:
      entry && "participantIds" in entry
        ? entry.participantIds
        : trip.members.map((m) => m.id),
    memberId:
      entry && "memberId" in entry
        ? entry.memberId
        : (trip.members[0]?.id ?? ""),
    date:
      entry && "billTime" in entry
        ? (entry.billTime ?? "")
        : entry && "date" in entry
          ? (entry.date ?? "")
          : "",
  });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const originalForm = useRef(JSON.stringify(form));
  const field = <K extends keyof ExpenseDraft>(
    key: K,
    value: ExpenseDraft[K],
  ) => {
    setFormError("");
    setForm((f) => ({ ...f, [key]: value }));
  };
  async function submit() {
    if (busy) return;
    try {
      putExpense(trip, form);
    } catch (error) {
      setFormError((error as Error).message);
      return;
    }
    setBusy(true);
    try {
      await updateTrip(trip.id, (current) => putExpense(current, form));
      onClose();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      title={`${id ? "编辑" : "新增"}${labels[kind]}`}
      onClose={() => {
        void closeForm(
          JSON.stringify(form) !== originalForm.current,
          busy,
          onClose,
        );
      }}
      footer={
        <Action disabled={busy} onClick={() => void submit()}>
          {busy ? "正在保存…" : "保存费用"}
        </Action>
      }
    >
      <Text className="form-intro">
        {kind === "shared"
          ? "由同行伙伴分摊，成员代付会在结算时自动抵扣。"
          : kind === "travel"
            ? "车票、机票等交通费用，按参与人员平均分摊。"
            : "只归属于指定伙伴，不参与公共分摊。"}
      </Text>
      {formError && <View className="inline-error">{formError}</View>}
      <Field
        label="金额（元）"
        numeric
        value={form.amount}
        onChange={(v) => field("amount", v)}
      />
      <Field
        label="事项"
        value={form.title}
        onChange={(v) => field("title", v)}
        placeholder="例如：午餐、酒店、车票"
      />

      {kind === "shared" && (
        <>
          <Select
            label="类别"
            values={categories.map((c) => ({ id: c, name: c }))}
            value={form.category}
            onChange={(v) => field("category", v)}
          />
          <Select
            label="付款人"
            values={[{ id: "", name: "公共付款" }, ...trip.members]}
            value={form.payerId}
            onChange={(v) => field("payerId", v)}
          />
        </>
      )}
      {kind === "personal" ? (
        <Select
          label="归属人员"
          values={trip.members}
          value={form.memberId}
          onChange={(v) => field("memberId", v)}
        />
      ) : (
        <MemberChoices
          members={trip.members}
          ids={form.participantIds}
          onChange={(v) => field("participantIds", v)}
        />
      )}
      {kind !== "travel" && (
        <DateField
          label="费用日期（选填）"
          value={form.date}
          onChange={(v) => field("date", v)}
        />
      )}
      <Field
        label="备注（选填）"
        value={form.note}
        onChange={(v) => field("note", v)}
      />
    </Sheet>
  );
}
export function BulkEditor({
  trip,
  categories,
  ids,
  onClose,
}: {
  trip: Trip;
  categories: string[];
  ids: string[];
  onClose: () => void;
}) {
  const first = trip.sharedExpenses.find((e) => ids.includes(e.id));
  const [category, setCategory] = useState(
    first?.category ?? categories[0] ?? "其他",
  );
  const [participants, setParticipants] = useState(
    first?.participantIds ?? trip.members.map((m) => m.id),
  );
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!participants.length) return notify("请选择分摊人员");
    if (!categories.includes(category)) return notify("请选择有效类别");
    if (busy) return;
    setBusy(true);
    try {
      await updateTrip(trip.id, (t) => ({
        ...t,
        sharedExpenses: t.sharedExpenses.map((e) =>
          ids.includes(e.id)
            ? { ...e, category, participantIds: participants }
            : e,
        ),
      }));
      onClose();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      title={`批量编辑 ${ids.length} 项公共费用`}
      onClose={() => {
        void closeForm(
          category !== (first?.category ?? categories[0] ?? "其他") ||
            JSON.stringify(participants) !==
              JSON.stringify(
                first?.participantIds ?? trip.members.map((m) => m.id),
              ),
          busy,
          onClose,
        );
      }}
      footer={
        <Action disabled={busy} onClick={() => void save()}>
          应用并保存
        </Action>
      }
    >
      <Text className="muted">
        将统一替换所选费用的类别和分摊人员，金额、付款人保持原值。
      </Text>
      <Select
        label="类别"
        values={categories.map((c) => ({ id: c, name: c }))}
        value={category}
        onChange={setCategory}
      />
      <MemberChoices
        members={trip.members}
        ids={participants}
        onChange={setParticipants}
      />
    </Sheet>
  );
}
export function TextImporter({
  trip,
  state,
  onClose,
}: {
  trip: Trip;
  state: AppState;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<
    (LedgerImportDraft & { amountInput: string })[]
  >([]);
  const [participants, setParticipants] = useState(
    trip.members.map((m) => m.id),
  );
  const [busy, setBusy] = useState(false);
  const selected = drafts.filter((d) => d.selected);
  const categories = [...new Set([...state.categories, "其他"])];
  function patch(
    id: string,
    next: Partial<LedgerImportDraft & { amountInput: string }>,
  ) {
    setDrafts((current) =>
      current.map((d) => (d.id === id ? { ...d, ...next } : d)),
    );
  }
  async function save() {
    if (busy) return;
    if (!selected.length) return notify("请选择待导入项目");
    if (!participants.length) return notify("请选择分摊人员");
    try {
      for (const d of selected)
        putExpense(trip, {
          kind: "shared",
          title: d.title,
          amount: d.amountInput,
          category: d.category,
          payerId: "",
          participantIds: participants,
          memberId: "",
          date: d.billTime,
          note: d.note,
        });
    } catch (error) {
      return notify((error as Error).message);
    }
    setBusy(true);
    try {
      await saveChange((s) => {
        const expenses = selected.map((d) => ({
          id: uid("shared"),
          title: d.title.trim(),
          amount: Number(d.amountInput),
          category: d.category,
          participantIds: participants,
          billTime: d.billTime || undefined,
          note: d.note,
        }));
        return {
          ...s,
          categories: [
            ...new Set([...s.categories, ...expenses.map((e) => e.category)]),
          ],
          trips: s.trips.map((t) =>
            t.id === trip.id
              ? { ...t, sharedExpenses: [...t.sharedExpenses, ...expenses] }
              : t,
          ),
        };
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      title="账单文本导入"
      onClose={() => {
        void closeForm(Boolean(text.trim() || drafts.length), busy, onClose);
      }}
      footer={
        drafts.length > 0 ? (
          <Action
            disabled={busy || !selected.length}
            onClick={() => void save()}
          >
            确认导入 {selected.length} 项 · ¥
            {formatMoney(
              selected.reduce(
                (sum, d) => sum + (Number(d.amountInput) || 0),
                0,
              ),
            )}
          </Action>
        ) : undefined
      }
    >
      <Text className="muted">
        粘贴已识别的账单文本，解析后逐项核对。默认公共付款；截图识别将在后续版本提供。
      </Text>
      <Field
        label="账单文本"
        multiline
        value={text}
        onChange={(value) => {
          setText(value);
          setDrafts([]);
        }}
        placeholder={
          "5月16日\n打车出行 支付宝自动记账\n17:27 | 滴滴出行 -70.07"
        }
      />
      <Action
        secondary
        disabled={busy || !text.trim()}
        onClick={() => {
          const parsed = parseLedgerImportText(text, categories);
          setDrafts(
            parsed.map((d) => ({ ...d, amountInput: String(d.amount) })),
          );
          if (!parsed.length) notify("未识别到费用，请检查文本格式");
        }}
      >
        解析文本
      </Action>
      {drafts.length > 0 && (
        <>
          <MemberChoices
            members={trip.members}
            ids={participants}
            onChange={setParticipants}
          />
          <View className="actions">
            <Action
              secondary
              onClick={() =>
                setDrafts((items) =>
                  items.map((d) => ({ ...d, selected: true })),
                )
              }
            >
              全选
            </Action>
            <Action
              secondary
              onClick={() =>
                setDrafts((items) =>
                  items.map((d) => ({ ...d, selected: false })),
                )
              }
            >
              清空选择
            </Action>
          </View>
        </>
      )}
      {drafts.map((draft) => (
        <View className="import-card" key={draft.id}>
          <Action
            secondary
            onClick={() => patch(draft.id, { selected: !draft.selected })}
          >
            {draft.selected ? "✓ 已选" : "未选"}
          </Action>
          <Field
            label="事项"
            value={draft.title}
            onChange={(title) => patch(draft.id, { title })}
          />
          <Field
            label="金额"
            numeric
            value={draft.amountInput}
            onChange={(amountInput) => patch(draft.id, { amountInput })}
          />
          <Select
            label="类别"
            values={categories.map((c) => ({ id: c, name: c }))}
            value={draft.category}
            onChange={(category) => patch(draft.id, { category })}
          />
          <DateField
            label="日期"
            value={draft.billTime}
            onChange={(billTime) => patch(draft.id, { billTime })}
          />
          <Field
            label="备注"
            value={draft.note}
            onChange={(note) => patch(draft.id, { note })}
          />
        </View>
      ))}
      {!drafts.length && <Empty text="解析结果会显示在这里" />}
    </Sheet>
  );
}
