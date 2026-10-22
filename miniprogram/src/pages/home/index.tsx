import { useRef, useState } from "react";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { View, Text, Button, Input } from "@tarojs/components";
import type { AppState, Trip } from "@ledger/trip-types";
import {
  calculateGlobal,
  calculateTrip,
  createReadableId,
  formatMoney,
  isPersonNameTaken,
  isCategoryNameTaken,
  renamePersonInState,
  renameCategoryInState,
  renameTripInState,
  getGlobalCategoryTotals,
} from "@ledger/trip-utils";
import {
  Action,
  Empty,
  Field,
  Panel,
  Sheet,
  SyncStatus,
  closeForm,
} from "../../components/ui";
import {
  confirmAction,
  loadLedger,
  notify,
  requireLedgerLogin,
  refreshLedger,
  resetLedger,
  saveChange,
  useLedger,
} from "../../lib/store";
import { hasMiniSession, loginMini } from "../../lib/api";

import {
  AmountSummary,
  Avatar,
  BottomNav,
  CategoryBars,
  Icon,
  MoreButton,
  SearchBox,
  SectionHeader,
} from "../../components/visual";

type Form = {
  type: "trip" | "person" | "category";
  id?: string;
  name: string;
  note: string;
};
export default function HomePage() {
  const ledger = useLedger();
  const [tab, setTab] = useState("工作台");
  const initialForm = useRef("");
  const [form, setForm] = useState<Form | null>(null);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  useDidShow(() => {
    if (!hasMiniSession()) {
      requireLedgerLogin();
      return;
    }
    if (!ledger.state && !ledger.error) void loadLedger();
  });
  usePullDownRefresh(() => {
    void refreshLedger().finally(() => Taro.stopPullDownRefresh());
  });
  const state = ledger.state;
  const blocked = ledger.saving || ledger.loading || ledger.dirty || submitting;
  const open = (type: Form["type"], id?: string, name = "", note = "") => {
    const next = { type, id, name, note };
    initialForm.current = JSON.stringify(next);
    setForm(next);
  };
  const enter = (trip: Trip) =>
    void Taro.navigateTo({
      url: `/pages/trip/index?tripId=${encodeURIComponent(trip.id)}`,
    });

  function openLogin() {
    setLoginPassword("");
    setLoginError("");
    setLoginOpen(true);
  }

  async function connectLedger() {
    if (!loginPassword || loggingIn) return;
    setLoggingIn(true);
    setLoginError("");
    try {
      await loginMini(loginPassword);
      resetLedger();
      setLoginOpen(false);
      setLoginPassword("");
      await loadLedger(true);
      notify("账本已连接");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "登录失败，请稍后重试");
    } finally {
      setLoggingIn(false);
    }
  }

  async function submit() {
    if (!state || !form || blocked) return;
    const name = form.name.trim();
    if (!name) return notify("请填写名称");
    if (form.type === "person" && isPersonNameTaken(state, name, form.id))
      return notify("人员姓名不能重复");
    if (form.type === "category" && isCategoryNameTaken(state, name, form.id))
      return notify("类别名称不能重复");
    setSubmitting(true);
    const current = form;
    try {
      const ok = await saveChange((s) => {
        if (current.type === "trip") {
          if (current.id)
            return {
              ...renameTripInState(s, current.id, name),
              trips: renameTripInState(s, current.id, name).trips.map((t) =>
                t.id === current.id ? { ...t, dates: current.note.trim() } : t,
              ),
            };
          return {
            ...s,
            trips: [
              ...s.trips,
              {
                id: createReadableId(
                  name,
                  s.trips.map((t) => t.id),
                ),
                title: name,
                dates: current.note.trim(),
                members: [],
                sharedExpenses: [],
                travelCosts: [],
                personalExpenses: [],
              },
            ],
          };
        }
        if (current.type === "person") {
          if (current.id) {
            const renamed = renamePersonInState(s, current.id, name);
            return {
              ...renamed,
              people: renamed.people.map((p) =>
                p.id === current.id ? { ...p, note: current.note.trim() } : p,
              ),
              trips: renamed.trips.map((t) => ({
                ...t,
                members: t.members.map((p) =>
                  p.id === current.id ? { ...p, note: current.note.trim() } : p,
                ),
              })),
            };
          }
          return {
            ...s,
            people: [
              ...s.people,
              {
                id: createReadableId(
                  name,
                  s.people.map((p) => p.id),
                ),
                name,
                note: current.note.trim(),
              },
            ],
          };
        }
        return current.id
          ? renameCategoryInState(s, current.id, name)
          : { ...s, categories: [...s.categories, name] };
      });
      setForm(null);
      if (ok) notify("已保存");
    } finally {
      setSubmitting(false);
    }
  }
  async function remove(type: Form["type"], id: string) {
    if (!state || blocked) return;
    if (type === "trip") {
      const trip = state.trips.find((t) => t.id === id);
      if (
        !trip ||
        trip.sharedExpenses.length +
          trip.travelCosts.length +
          trip.personalExpenses.length
      )
        return notify("有费用的账单不能删除");
    }
    if (
      type === "person" &&
      state.trips.some((t) => t.members.some((p) => p.id === id))
    )
      return notify("已被账单使用的人员不能删除");
    if (
      type === "category" &&
      state.trips.some((t) => t.sharedExpenses.some((e) => e.category === id))
    )
      return notify("已被费用使用的类别不能删除");
    if (!(await confirmAction("删除后无法恢复，是否继续？"))) return;
    await saveChange((s: AppState) => ({
      ...s,
      trips: type === "trip" ? s.trips.filter((t) => t.id !== id) : s.trips,
      people:
        type === "person" ? s.people.filter((p) => p.id !== id) : s.people,
      categories:
        type === "category"
          ? s.categories.filter((c) => c !== id)
          : s.categories,
    }));
  }
  const totals = state ? calculateGlobal(state) : null;
  const kind =
    tab === "出行管理" ? "trip" : tab === "人员管理" ? "person" : "category";
  const filteredTrips =
    state?.trips.filter((t) => t.title.includes(search.trim())) ?? [];
  const filteredPeople =
    state?.people.filter((p) => p.name.includes(search.trim())) ?? [];
  const filteredCategories =
    state?.categories.filter((c) => c.includes(search.trim())) ?? [];
  function switchTab(value: string) {
    setTab(value);
    setSearch("");
    void Taro.pageScrollTo({ scrollTop: 0, duration: 0 });
  }
  async function menu(type: Form["type"], id: string, name: string, note = "") {
    if (blocked) return;
    try {
      const choice = await Taro.showActionSheet({
        itemList: ["编辑", "删除"],
        itemColor: "#203e35",
      });
      if (choice.tapIndex === 0) open(type, id, name, note);
      else await remove(type, id);
    } catch {
      /* Dismissing the native menu leaves the item unchanged. */
    }
  }
  const tripCard = (trip: Trip, index: number) => (
    <View
      className="journey-card"
      key={trip.id}
      hoverClass="tap-soft"
      onClick={() => enter(trip)}
    >
      <View className={`journey-mark tone-${index % 4}`}>
        <Icon name="trip" />
      </View>
      <View className="journey-info">
        <Text className="item-title">{trip.title}</Text>
        <Text className="muted">{trip.dates || "日期待填写"}</Text>
        <View className="journey-footer">
          <View className="mini-avatars">
            {trip.members.slice(0, 3).map((person) => (
              <Avatar key={person.id} name={person.name} small />
            ))}
            <Text>{trip.members.length} 人同行</Text>
          </View>
          <Text className="money">
            ¥{formatMoney(calculateTrip(trip).expenseTotal)}
          </Text>
        </View>
      </View>
      {tab === "出行管理" ? (
        <MoreButton
          label={`管理账单${trip.title}`}
          onClick={() => void menu("trip", trip.id, trip.title, trip.dates)}
        />
      ) : (
        <Icon name="chevron" />
      )}
    </View>
  );
  return (
    <View className="page home-page">
      <View className="page-heading header-row">
        <View className="header-main">
          <Text className="eyebrow">TRIP LEDGER</Text>
          <Text className="page-title">
            {tab === "工作台" ? "把每一程，记清楚。" : tab}
          </Text>
          <Text className="page-caption">
            {tab === "工作台"
              ? "旅行的美好，一起记下，一起分担。"
              : tab === "出行管理"
                ? "每段旅程，都有一本共同的账。"
                : tab === "人员管理"
                  ? "同行的人，下一程再见。"
                  : "井井有条，才看得清每一笔。"}
          </Text>
        </View>
        {tab !== "工作台" && (
          <View className="header-actions">
            <Button
              className="circle-add"
              ariaLabel={`新增${kind === "trip" ? "账单" : kind === "person" ? "人员" : "类别"}`}
              disabled={blocked || !state}
              onClick={() => open(kind)}
            >
              <Icon name="plus" />
            </Button>
          </View>
        )}
      </View>
      <SyncStatus />
      {!state && (
        <Panel
          title={
            ledger.loading
              ? "正在打开账本"
              : ledger.authRequired
                ? "连接账本"
                : "暂时无法读取账本"
          }
        >
          <Empty
            text={
              ledger.loading
                ? "稍等一下，旅程正在加载…"
                : ledger.authRequired
                  ? "登录后可查看和管理旅行账单"
                : "请检查连接后，点击上方刷新重试"
            }
          />
          {ledger.authRequired && (
            <View className="connect-ledger-action">
              <Action onClick={openLogin}>登录并连接</Action>
            </View>
          )}
        </Panel>
      )}
      {state && totals && (
        <>
          {tab === "工作台" ? (
            <>
              <AmountSummary
                dark
                total={totals.finalTotal}
                shared={totals.sharedTotal}
                travel={totals.travelTotal}
                personal={totals.personalTotal}
              />
              <View className="overview-strip">
                <View onClick={() => switchTab("出行管理")}>
                  <Text className="strip-number">
                    {totals.tripCount}
                    <Text className="strip-unit"> 本</Text>
                  </Text>
                  <Text>出行账单</Text>
                </View>
                <View onClick={() => switchTab("人员管理")}>
                  <Text className="strip-number">
                    {state.people.length}
                    <Text className="strip-unit"> 位</Text>
                  </Text>
                  <Text>同行伙伴</Text>
                </View>
                <View onClick={() => switchTab("类别管理")}>
                  <Text className="strip-number">
                    {state.categories.length}
                    <Text className="strip-unit"> 类</Text>
                  </Text>
                  <Text>费用分类</Text>
                </View>
              </View>
              <SectionHeader
                title="出行账单"
                note={`${state.trips.length} 本共同的旅行记忆`}
                action="查看全部"
                onAction={() => switchTab("出行管理")}
              />
              <View className="journey-list">
                {state.trips.slice(-3).reverse().map(tripCard)}
                {!state.trips.length && (
                  <Empty text="创建第一本账单，开启下一段旅程" />
                )}
              </View>
              <Button
                className="new-journey"
                disabled={blocked}
                hoverClass="tap-soft"
                onClick={() => open("trip")}
              >
                <View className="new-journey-icon">
                  <Icon name="plus" />
                </View>
                <View>
                  <Text className="item-title">开启一段新旅程</Text>
                  <Text className="muted">新建账单，记录旅途里的每一笔</Text>
                </View>
                <Icon name="chevron" />
              </Button>
              <Panel title="公共费用分布" subtitle="看看旅途的花费都去了哪里">
                {totals.sharedTotal ? (
                  <CategoryBars items={getGlobalCategoryTotals(state.trips)} />
                ) : (
                  <Empty text="记录第一笔公共费用后，这里会呈现费用分布" />
                )}
              </Panel>
            </>
          ) : (
            <>
              <SearchBox
                value={search}
                onChange={setSearch}
                placeholder={
                  tab === "出行管理"
                    ? "搜索账单名称"
                    : tab === "人员管理"
                      ? "搜索同行伙伴"
                      : "搜索费用类别"
                }
              />
              <View className="list-caption">
                <Text>
                  {tab === "出行管理"
                    ? `${filteredTrips.length} 本账单`
                    : tab === "人员管理"
                      ? `${filteredPeople.length} 位伙伴`
                      : `${filteredCategories.length} 个类别`}
                </Text>
                <Text>点击 ··· 进行管理</Text>
              </View>
              {tab === "出行管理" && (
                <View className="journey-list">
                  {filteredTrips.map(tripCard)}
                  {!filteredTrips.length && (
                    <Empty
                      text={
                        search
                          ? "没有找到相关账单，试试其他关键词"
                          : "还没有账单，点击右上角 + 新建"
                      }
                    />
                  )}
                </View>
              )}
              {tab === "人员管理" && (
                <View className="roster-list">
                  {filteredPeople.map((person) => (
                    <View className="roster-row" key={person.id}>
                      <Avatar name={person.name} />
                      <View className="row-main">
                        <Text className="item-title">{person.name}</Text>
                        <Text className="muted">
                          {person.note ||
                            `已参与 ${state.trips.filter((t) => t.members.some((m) => m.id === person.id)).length} 本账单`}
                        </Text>
                      </View>
                      <MoreButton
                        label={`管理人员${person.name}`}
                        onClick={() =>
                          void menu(
                            "person",
                            person.id,
                            person.name,
                            person.note,
                          )
                        }
                      />
                    </View>
                  ))}
                  {!filteredPeople.length && (
                    <Empty
                      text={
                        search
                          ? "没有找到相关人员"
                          : "添加同行伙伴，下次记账更方便"
                      }
                    />
                  )}
                </View>
              )}
              {tab === "类别管理" && (
                <View className="roster-list">
                  {filteredCategories.map((category, index) => (
                    <View className="roster-row" key={category}>
                      <View className={`category-mark tone-${index % 4}`}>
                        <Icon name="category" />
                      </View>
                      <View className="row-main">
                        <Text className="item-title">{category}</Text>
                        <Text className="muted">
                          {state.trips.reduce(
                            (count, t) =>
                              count +
                              t.sharedExpenses.filter(
                                (e) => e.category === category,
                              ).length,
                            0,
                          )}{" "}
                          笔公共费用
                        </Text>
                      </View>
                      <MoreButton
                        label={`管理类别${category}`}
                        onClick={() =>
                          void menu("category", category, category)
                        }
                      />
                    </View>
                  ))}
                  {!filteredCategories.length && (
                    <Empty
                      text={
                        search
                          ? "没有找到相关类别"
                          : "添加类别，让旅途花费更清晰"
                      }
                    />
                  )}
                </View>
              )}
              <Text className="list-footnote">
                {tab === "人员管理"
                  ? "修改姓名会同步到所有账单 · 已被使用的人员不可删除"
                  : tab === "类别管理"
                    ? "修改类别会同步到相关费用 · 已被使用的类别不可删除"
                    : "有费用记录的账单需要先清理费用后才能删除"}
              </Text>
            </>
          )}
        </>
      )}
      <BottomNav value={tab} onChange={switchTab} />
      {loginOpen && (
        <Sheet
          compact
          title="登录并连接账本"
          onClose={() => {
            if (!loggingIn) setLoginOpen(false);
          }}
          footer={
            <Action
              disabled={!loginPassword || loggingIn}
              onClick={() => void connectLedger()}
            >
              {loggingIn ? "正在连接…" : "登录并连接"}
            </Action>
          }
        >
          <Text className="form-intro">输入访问密码后，将在 7 天内保持账本连接。</Text>
          <View className="field">
            <Text className="label">访问密码</Text>
            <Input
              className="input"
              type="text"
              password
              value={loginPassword}
              maxlength={100}
              confirmType="done"
              placeholder="请输入密码"
              placeholderClass="input-placeholder"
              onInput={(event) => setLoginPassword(event.detail.value)}
              onConfirm={() => void connectLedger()}
            />
          </View>
          {loginError && <Text className="login-error">{loginError}</Text>}
        </Sheet>
      )}
      {form && (
        <Sheet
          compact
          title={`${form.id ? "编辑" : "新增"}${form.type === "trip" ? "出行账单" : form.type === "person" ? "同行伙伴" : "费用类别"}`}
          onClose={() => {
            void closeForm(
              JSON.stringify(form) !== initialForm.current,
              submitting,
              () => setForm(null),
            );
          }}
          footer={
            <Action
              disabled={blocked || !form.name.trim()}
              onClick={() => void submit()}
            >
              {submitting ? "正在保存…" : "确认保存"}
            </Action>
          }
        >
          <Text className="form-intro">
            {form.type === "trip"
              ? "给这次旅行起个名字，把美好和花费一起收藏。"
              : form.type === "person"
                ? "伙伴只需添加一次，即可加入不同的出行账单。"
                : "用熟悉的分类，整理旅途的每一笔花费。"}
          </Text>
          <Field
            label={
              form.type === "trip"
                ? "账单名称"
                : form.type === "person"
                  ? "伙伴姓名"
                  : "类别名称"
            }
            value={form.name}
            onChange={(name) => setForm({ ...form, name })}
            placeholder={
              form.type === "trip"
                ? "例如：秋日杭州三日游"
                : form.type === "person"
                  ? "填写姓名或昵称"
                  : "例如：住宿、餐饮"
            }
          />
          {form.type !== "category" && (
            <Field
              label={form.type === "trip" ? "出行日期" : "备注"}
              value={form.note}
              onChange={(note) => setForm({ ...form, note })}
              placeholder={
                form.type === "trip"
                  ? "例如：2026.10.01 — 10.07"
                  : "选填，帮助你记住这位伙伴"
              }
            />
          )}
        </Sheet>
      )}
    </View>
  );
}
