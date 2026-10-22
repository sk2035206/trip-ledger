import { useState } from "react";
import Taro, {
  useLoad,
  usePullDownRefresh,
  useShareAppMessage,
} from "@tarojs/taro";
import { View, Text, Button, Picker } from "@tarojs/components";
import {
  expenseKeys,
  removeExpenses,
  type ExpenseKind,
} from "@ledger/ledger-actions";
import {
  getTripMemberRemovalImpact,
  removeTripMember,
} from "@ledger/trip-utils";
import LedgerView from "../../components/ledger-view";
import {
  BulkEditor,
  ExpenseEditor,
  TextImporter,
} from "../../components/expense-editor";
import { Action, Empty, Sheet, SyncStatus } from "../../components/ui";
import {
  confirmAction,
  loadLedger,
  notify,
  requireLedgerLogin,
  refreshLedger,
  updateTrip,
  useLedger,
} from "../../lib/store";
import { Avatar, Icon, SearchBox } from "../../components/visual";
import { shareInfo } from "../../lib/api";
import { hasMiniSession } from "../../lib/api";

type Modal =
  | { kind: "expense"; type: ExpenseKind; id?: string }
  | { kind: "bulk"; ids: string[] }
  | { kind: "import" }
  | { kind: "members" };
export default function TripPage() {
  const ledger = useLedger();
  const [tripId, setTripId] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [modal, setModal] = useState<Modal | null>(null);
  const trip = ledger.state?.trips.find((t) => t.id === tripId);
  const disabled = ledger.saving || ledger.dirty || ledger.loading;
  useLoad((params) => {
    if (!hasMiniSession()) {
      requireLedgerLogin();
      return;
    }
    setTripId(params.tripId ?? "");
    if (!ledger.state) void loadLedger();
  });
  usePullDownRefresh(() => {
    void refreshLedger().finally(() => Taro.stopPullDownRefresh());
  });
  useShareAppMessage(() =>
    trip ? shareInfo(trip) : { title: "旅行分账", path: "/pages/home/index" },
  );
  async function remove(kind: ExpenseKind, ids: string[]) {
    if (!trip || disabled) return;
    const entries = trip[expenseKeys[kind]].filter((e) => ids.includes(e.id));
    if (
      !(await confirmAction(
        `确定删除 ${entries.length} 项费用？${entries
          .slice(0, 3)
          .map((e) => e.title)
          .join("、")}。删除后无法恢复。`,
      ))
    )
      return;
    await updateTrip(trip.id, (t) => removeExpenses(t, kind, ids));
  }
  async function removeMember(id: string) {
    if (!trip || disabled) return;
    const name = trip.members.find((m) => m.id === id)?.name ?? "该成员";
    const impact = getTripMemberRemovalImpact(trip, id);
    const detail = impact.map((i) => `${i.label} ${i.count} 项`).join("、");
    if (
      !(await confirmAction(
        impact.length
          ? `移除${name}将影响：${detail}。确认后清理其分摊关系、付款人信息和名下个人费用，并重新分摊。`
          : `将${name}移出本次账单？全局人员库仍会保留。`,
      ))
    )
      return;
    await updateTrip(trip.id, (t) => removeTripMember(t, id));
  }
  return (
    <View className="page">
      <SyncStatus />
      {trip && ledger.state ? (
        <>
          <View className="trip-heading">
            <View className="trip-topline header-row">
              <View className="journey-tag header-main">
                <Icon name="trip" />
                <Text>本次出行</Text>
              </View>
              <View className="header-actions">
                <Button className="share-control" openType="share">
                  <Icon name="share" />
                  <Text>分享账单</Text>
                </Button>
              </View>
            </View>
            <Text className="trip-title">{trip.title}</Text>
            <View className="trip-subline">
              <Text>
                {trip.dates || "日期待填写"} · {trip.members.length} 人同行
              </Text>
              <Picker
                mode="selector"
                range={ledger.state.trips.map((t) => t.title)}
                value={ledger.state.trips.findIndex((t) => t.id === trip.id)}
                disabled={disabled}
                onChange={(event) => {
                  const next = ledger.state?.trips[Number(event.detail.value)];
                  if (next && next.id !== trip.id)
                    void Taro.redirectTo({
                      url: `/pages/trip/index?tripId=${encodeURIComponent(next.id)}`,
                    });
                }}
              >
                <View className="trip-picker">
                  切换账单
                  <Icon name="chevron" />
                </View>
              </Picker>
            </View>
          </View>
          <LedgerView
            key={trip.id}
            trip={trip}
            disabled={disabled}
            onAdd={(type) => {
              if (!trip.members.length) return notify("请先添加本次人员");
              setModal({ kind: "expense", type });
            }}
            onEdit={(type, id) => setModal({ kind: "expense", type, id })}
            onDelete={(kind, ids) => void remove(kind, ids)}
            onBulk={(ids) => setModal({ kind: "bulk", ids })}
            onImport={() => setModal({ kind: "import" })}
            onAddMember={() => {
              setMemberSearch("");
              setModal({ kind: "members" });
            }}
            onRemoveMember={(id) => void removeMember(id)}
          />
          {modal?.kind === "expense" && (
            <ExpenseEditor
              trip={trip}
              categories={ledger.state.categories}
              kind={modal.type}
              id={modal.id}
              onClose={() => setModal(null)}
            />
          )}
          {modal?.kind === "bulk" && (
            <BulkEditor
              trip={trip}
              categories={ledger.state.categories}
              ids={modal.ids}
              onClose={() => setModal(null)}
            />
          )}
          {modal?.kind === "import" && (
            <TextImporter
              trip={trip}
              state={ledger.state}
              onClose={() => setModal(null)}
            />
          )}
          {modal?.kind === "members" && (
            <Sheet title="从人员库添加" onClose={() => setModal(null)}>
              <Text className="form-intro">
                从人员库选择同行伙伴，姓名可在首页人员管理中修改。
              </Text>
              <SearchBox
                value={memberSearch}
                onChange={setMemberSearch}
                placeholder="搜索伙伴姓名"
              />
              <View className="roster-list">
                {ledger.state.people
                  .filter(
                    (p) =>
                      p.name.includes(memberSearch.trim()) &&
                      !trip.members.some((m) => m.id === p.id),
                  )
                  .map((person) => (
                    <View className="roster-row" key={person.id}>
                      <Avatar name={person.name} />
                      <Text className="row-main">{person.name}</Text>
                      <Action
                        disabled={disabled}
                        onClick={() =>
                          void updateTrip(trip.id, (t) =>
                            t.members.some((m) => m.id === person.id)
                              ? t
                              : { ...t, members: [...t.members, person] },
                          )
                        }
                      >
                        添加
                      </Action>
                    </View>
                  ))}
                {ledger.state.people.every((p) =>
                  trip.members.some((m) => m.id === p.id),
                ) && <Empty text="暂无可添加人员，请先到人员管理新增" />}
              </View>
            </Sheet>
          )}
        </>
      ) : (
        <View>
          <Empty
            text={
              ledger.loading
                ? "读取账单中…"
                : ledger.authRequired
                  ? "登录并连接账本后可查看详情"
                  : "账单不存在或尚未读取，请刷新重试"
            }
          />
          {ledger.authRequired && (
            <View className="connect-ledger-action">
              <Action onClick={() => void Taro.reLaunch({ url: "/pages/home/index" })}>
                返回首页连接账本
              </Action>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
