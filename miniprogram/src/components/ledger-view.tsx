import { useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Button } from "@tarojs/components";
import type { Trip } from "@ledger/trip-types";
import type { ExpenseKind } from "@ledger/ledger-actions";
import {
  calculateTrip,
  formatMoney,
  getGroupCategoryTotals,
  getMemberLedgerItems,
  getMemberName,
  getTripCategoryTotals,
  splitAmount,
} from "@ledger/trip-utils";
import { Action, Chips, Empty, Panel, Sheet } from "./ui";
import {
  AmountSummary,
  Avatar,
  CategoryBars,
  Icon,
  MoreButton,
  SectionHeader,
} from "./visual";

type Props = {
  trip: Trip;
  disabled?: boolean;
  onAdd?: (kind: ExpenseKind) => void;
  onEdit?: (kind: ExpenseKind, id: string) => void;
  onDelete?: (kind: ExpenseKind, ids: string[]) => void;
  onBulk?: (ids: string[]) => void;
  onImport?: () => void;
  onAddMember?: () => void;
  onRemoveMember?: (id: string) => void;
};
const tabKind: Record<string, ExpenseKind> = {
  公费: "shared",
  出行: "travel",
  个人: "personal",
};
const kindNames = {
  shared: "公共费用",
  travel: "出行费用",
  personal: "个人费用",
};
export default function LedgerView({
  trip,
  disabled,
  onAdd,
  onEdit,
  onDelete,
  onBulk,
  onImport,
  onAddMember,
  onRemoveMember,
}: Props) {
  const [tab, setTab] = useState("总览");
  const [category, setCategory] = useState("全部");
  const [memberId, setMemberId] = useState("");
  const [typeFilter, setTypeFilter] = useState("全部");
  const [detailCategory, setDetailCategory] = useState("全部");
  const [selected, setSelected] = useState<string[]>([]);
  const [batchMode, setBatchMode] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const totals = calculateTrip(trip);
  const categories = [...new Set(trip.sharedExpenses.map((e) => e.category))];
  const activeCategory = categories.includes(category) ? category : "全部";
  const selectedIds = selected.filter((id) =>
    trip.sharedExpenses.some((e) => e.id === id),
  );
  const filteredShared = trip.sharedExpenses.filter(
    (e) => activeCategory === "全部" || e.category === activeCategory,
  );
  const allFiltered =
    filteredShared.length > 0 &&
    filteredShared.every((e) => selectedIds.includes(e.id));
  const member = trip.members.find((m) => m.id === memberId);
  const memberTotal = totals.memberTotals.find(
    (item) => item.member.id === memberId,
  );
  const details = member ? getMemberLedgerItems(trip, member.id) : [];
  const detailCategories = [...new Set(details.map((e) => e.category))];
  const filter = detailCategories.includes(detailCategory)
    ? detailCategory
    : "全部";
  const filteredDetails = details.filter(
    (item) =>
      (typeFilter === "全部" || item.type === typeFilter) &&
      (filter === "全部" || item.category === filter),
  );
  const groupTotal = totals.memberTotals
    .filter((item) => groupIds.includes(item.member.id))
    .reduce((sum, item) => sum + item.total, 0);
  const groupCategories = groupIds.length
    ? getGroupCategoryTotals(trip, groupIds)
    : getTripCategoryTotals(trip);
  const kind = tabKind[tab];
  const hasComposer = Boolean(onAdd || onAddMember);
  function openMember(id: string) {
    setMemberId(id);
    setTypeFilter("全部");
    setDetailCategory("全部");
  }
  function switchTab(value: string) {
    setTab(value);
    setBatchMode(false);
    setSelected([]);
  }
  function toggle(id: string) {
    setSelected((ids) =>
      ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id],
    );
  }
  async function expenseMenu(type: ExpenseKind, id: string) {
    if (disabled || !onEdit) return;
    try {
      const result = await Taro.showActionSheet({
        itemList: ["编辑费用", "删除费用"],
        itemColor: "#203e35",
      });
      if (result.tapIndex === 0) onEdit(type, id);
      else onDelete?.(type, [id]);
    } catch {
      /* Native action sheet cancelled. */
    }
  }
  async function addExpense() {
    if (disabled || !onAdd) return;
    if (kind) {
      onAdd(kind);
      return;
    }
    try {
      const result = await Taro.showActionSheet({
        itemList: [
          "公共费用 · 多人分摊",
          "出行费用 · 车票与机票",
          "个人费用 · 个人归属",
        ],
        itemColor: "#203e35",
      });
      onAdd((["shared", "travel", "personal"] as const)[result.tapIndex]);
    } catch {
      /* Native action sheet cancelled. */
    }
  }
  const renderTotals = () => (
    <View className="settlement-list">
      {totals.memberTotals.map((item) => (
        <View
          className="member-total-row"
          key={item.member.id}
          hoverClass="tap-soft"
          onClick={() => openMember(item.member.id)}
        >
          <Avatar name={item.member.name} />
          <View className="row-main">
            <Text className="item-title">{item.member.name}</Text>
            <Text className="muted">
              公共 {formatMoney(item.shared)} · 出行 {formatMoney(item.travel)}
            </Text>
            <Text className="muted">
              个人 {formatMoney(item.personal)} · 已付 {formatMoney(item.paid)}
            </Text>
          </View>
          <View className="payable">
            <Text className="payable-label">
              {item.total < 0 ? "应收回" : "应支付"}
            </Text>
            <Text className={`money ${item.total < 0 ? "refund" : ""}`}>
              ¥{formatMoney(Math.abs(item.total))}
            </Text>
          </View>
          <Icon name="chevron" />
        </View>
      ))}
      {!trip.members.length && <Empty text="先添加同行人员，再开始记录费用" />}
    </View>
  );
  const renderExpense = (
    entry:
      | Trip["sharedExpenses"][number]
      | Trip["travelCosts"][number]
      | Trip["personalExpenses"][number],
    type: ExpenseKind,
  ) => {
    const shared = "category" in entry;
    const participants = "participantIds" in entry ? entry.participantIds : [];
    const date = shared ? entry.billTime : "date" in entry ? entry.date : "";
    return (
      <View
        className={`expense-card ${batchMode && selectedIds.includes(entry.id) ? "expense-selected" : ""}`}
        key={entry.id}
      >
        <View className="expense-top">
          <View
            className={`expense-symbol ${type === "shared" ? "tone-0" : type === "travel" ? "tone-1" : "tone-2"}`}
          >
            <Icon
              name={
                type === "travel"
                  ? "trip"
                  : type === "personal"
                    ? "people"
                    : "receipt"
              }
            />
          </View>
          <View className="row-main">
            <Text className="item-title">{entry.title}</Text>
            <Text className="muted">
              {shared ? entry.category : kindNames[type]}
              {date ? ` · ${date}` : ""}
            </Text>
          </View>
          <View className="expense-value">
            <Text className="money">¥{formatMoney(entry.amount)}</Text>
            {type !== "personal" && (
              <Text className="muted">
                人均{" "}
                {formatMoney(splitAmount(entry.amount, participants.length))}
              </Text>
            )}
          </View>
          {onEdit &&
            (batchMode && type === "shared" ? (
              <Button
                className={`check-control ${selectedIds.includes(entry.id) ? "checked" : ""}`}
                ariaLabel={`选择费用${entry.title}`}
                disabled={disabled}
                onClick={() => toggle(entry.id)}
              >
                {selectedIds.includes(entry.id) && <Icon name="check" />}
              </Button>
            ) : (
              <MoreButton
                label={`管理费用${entry.title}`}
                onClick={() => void expenseMenu(type, entry.id)}
              />
            ))}
        </View>
        <View className="expense-meta">
          {shared && (
            <View className="expense-meta-line">
              <Text className="meta-label">付款人</Text>
              <Text>
                {entry.payerId
                  ? getMemberName(trip, entry.payerId)
                  : "公共付款"}
              </Text>
              {entry.payerId && <Text className="paid-tag">已代付</Text>}
            </View>
          )}
          {type !== "personal" ? (
            <View className="expense-meta-line">
              <Text className="meta-label">分摊人</Text>
              <Text className="participant-text">
                {participants.map((id) => getMemberName(trip, id)).join("、") ||
                  "暂无分摊人员"}
              </Text>
            </View>
          ) : (
            "memberId" in entry && (
              <View className="expense-meta-line">
                <Text className="meta-label">归属人</Text>
                <Text>{getMemberName(trip, entry.memberId)}</Text>
              </View>
            )
          )}
          {entry.note && <Text className="expense-note">{entry.note}</Text>}
        </View>
      </View>
    );
  };
  return (
    <View className={`ledger-area ${hasComposer ? "with-composer" : ""}`}>
      <View className="ledger-tabs">
        <Chips
          variant="tabs"
          options={["总览", "清单", "公费", "出行", "个人", "人员"]}
          value={tab}
          onChange={switchTab}
        />
      </View>
      {tab === "总览" && (
        <>
          <AmountSummary
            label="本次出行总费用"
            total={totals.expenseTotal}
            shared={totals.sharedTotal}
            travel={totals.travelTotal}
            personal={totals.personalTotal}
          />
          <View className="paid-strip">
            <View className="status-dot" />
            <Text>成员已代付</Text>
            <Text className="money">¥{formatMoney(totals.paidTotal)}</Text>
            <Text className="muted">结算时自动抵扣</Text>
          </View>
          <Panel
            title="公共费用分布"
            subtitle={`${trip.sharedExpenses.length} 笔费用，${categories.length} 个类别`}
          >
            {trip.sharedExpenses.length ? (
              <CategoryBars items={getTripCategoryTotals(trip)} />
            ) : (
              <Empty text="记录一笔公共费用，看看旅途花费的去向" />
            )}
          </Panel>
          <SectionHeader
            title="成员分账"
            note="点击伙伴，查看每一笔费用"
            action="完整清单"
            onAction={() => switchTab("清单")}
          />
          <View className="roster-list">{renderTotals()}</View>
        </>
      )}
      {tab === "清单" && (
        <>
          <SectionHeader
            title="分账清单"
            note={`${trip.members.length} 位同行伙伴`}
            action="小组合计"
            onAction={() => setGroupOpen(true)}
          />
          <View className="calculation-note">
            公共分摊 + 出行分摊 + 个人费用 − 已付款
          </View>
          <View className="roster-list">{renderTotals()}</View>
          <Text className="list-footnote">
            应收回表示该成员的代付款大于应承担费用。
          </Text>
        </>
      )}
      {kind && (
        <>
          <SectionHeader
            title={`${kindNames[kind]}清单`}
            note={`${(kind === "shared" ? filteredShared : kind === "travel" ? trip.travelCosts : trip.personalExpenses).length} 笔记录`}
            action={
              kind === "shared" && onBulk && trip.sharedExpenses.length
                ? batchMode
                  ? "完成"
                  : "批量管理"
                : undefined
            }
            onAction={() => {
              if (!disabled) {
                setBatchMode(!batchMode);
                setSelected([]);
              }
            }}
          />
          {kind === "shared" && (
            <Chips
              options={["全部", ...categories]}
              value={activeCategory}
              onChange={setCategory}
            />
          )}
          {kind === "shared" && batchMode && (
            <View className="selection-head header-row">
              <Text className="header-main">已选 {selectedIds.length} 笔</Text>
              <View className="header-actions">
                <Button
                  className="text-button"
                  disabled={disabled}
                  onClick={() =>
                    setSelected(
                      allFiltered
                        ? selectedIds.filter(
                            (id) => !filteredShared.some((e) => e.id === id),
                          )
                        : [
                            ...new Set([
                              ...selectedIds,
                              ...filteredShared.map((e) => e.id),
                            ]),
                          ],
                    )
                  }
                >
                  {allFiltered ? "取消全选" : "全选当前分类"}
                </Button>
              </View>
            </View>
          )}
          <View className="expense-list">
            {kind === "shared"
              ? filteredShared.map((entry) => renderExpense(entry, kind))
              : kind === "travel"
                ? trip.travelCosts.map((entry) => renderExpense(entry, kind))
                : trip.personalExpenses.map((entry) =>
                    renderExpense(entry, kind),
                  )}
          </View>
          {!(
            kind === "shared"
              ? filteredShared
              : kind === "travel"
                ? trip.travelCosts
                : trip.personalExpenses
          ).length && (
            <Panel title="还没有费用记录">
              <Empty
                text={
                  onAdd
                    ? "点击下方按钮，记下旅途的第一笔花费"
                    : "这趟旅程暂未记录此类费用"
                }
              />
            </Panel>
          )}
          <Text className="list-footnote">
            {kind === "shared"
              ? "成员代付会自动抵扣应付金额"
              : kind === "travel"
                ? "车票、机票等由参与人员平均分摊"
                : "个人费用只计入对应成员的最终应付"}
          </Text>
        </>
      )}
      {tab === "人员" && (
        <>
          <SectionHeader
            title="本次同行"
            note={`${trip.members.length} 位伙伴 · 从全局人员库添加`}
          />
          <View className="roster-list">
            {trip.members.map((person) => (
              <View className="roster-row" key={person.id}>
                <Avatar name={person.name} />
                <View
                  className="row-main"
                  onClick={() => openMember(person.id)}
                >
                  <Text className="item-title">{person.name}</Text>
                  <Text className="muted">查看个人分账明细</Text>
                </View>
                {onRemoveMember ? (
                  <Button
                    className="text-button danger-text"
                    disabled={disabled}
                    onClick={() => onRemoveMember(person.id)}
                  >
                    移除
                  </Button>
                ) : (
                  <Icon name="chevron" />
                )}
              </View>
            ))}
            {!trip.members.length && (
              <Empty text="添加同行伙伴后，就可以一起分摊费用了" />
            )}
          </View>
          <Text className="list-footnote">
            姓名在首页的人员管理中统一修改。
          </Text>
        </>
      )}
      {hasComposer && (
        <View className="composer">
          {batchMode && onBulk ? (
            <>
              <Text className="composer-note">
                已选 {selectedIds.length} 笔
              </Text>
              <Action
                secondary
                disabled={disabled || !selectedIds.length}
                onClick={() => onBulk(selectedIds)}
              >
                批量编辑
              </Action>
              <Action
                danger
                disabled={disabled || !selectedIds.length}
                onClick={() => onDelete?.("shared", selectedIds)}
              >
                删除
              </Action>
            </>
          ) : tab === "人员" && onAddMember ? (
            <Action disabled={disabled} onClick={onAddMember}>
              <Icon name="plus" />
              添加本次人员
            </Action>
          ) : (
            <>
              {onImport && (
                <Button
                  className="composer-secondary"
                  disabled={disabled}
                  onClick={onImport}
                >
                  <Icon name="import" />
                  <Text>文本导入</Text>
                </Button>
              )}
              <Action disabled={disabled} onClick={() => void addExpense()}>
                <Icon name="plus" />
                {kind ? `新增${kindNames[kind]}` : "记一笔费用"}
              </Action>
            </>
          )}
        </View>
      )}
      {member && memberTotal && (
        <Sheet
          title={`${member.name}的分账明细`}
          onClose={() => setMemberId("")}
        >
          <View className="member-detail-summary">
            <Avatar name={member.name} />
            <View>
              <Text className="muted">
                {memberTotal.total < 0 ? "本次应收回" : "本次应支付"}
              </Text>
              <Text className="metric">
                ¥{formatMoney(Math.abs(memberTotal.total))}
              </Text>
            </View>
          </View>
          <View className="member-breakdown">
            {[
              { label: "公共分摊", value: memberTotal.shared },
              { label: "出行分摊", value: memberTotal.travel },
              { label: "个人费用", value: memberTotal.personal },
              { label: "已付抵扣", value: memberTotal.paid },
            ].map((item) => (
              <View key={item.label}>
                <Text className="muted">{item.label}</Text>
                <Text>{formatMoney(item.value)}</Text>
              </View>
            ))}
          </View>
          <Chips
            options={["全部", "公共", "出行", "个人", "自付"]}
            value={typeFilter}
            onChange={setTypeFilter}
          />
          <Chips
            options={["全部", ...detailCategories]}
            value={filter}
            onChange={setDetailCategory}
          />
          {filteredDetails.map((item) => (
            <View className="detail-line" key={`${item.type}-${item.id}`}>
              <View className="row between">
                <Text className="item-title">{item.title}</Text>
                <Text className={`money ${item.amount < 0 ? "refund" : ""}`}>
                  ¥{formatMoney(item.amount)}
                </Text>
              </View>
              <Text className="muted">
                {item.type} · {item.category}
                {item.note ? ` · ${item.note}` : ""}
              </Text>
            </View>
          ))}
          {!filteredDetails.length && <Empty text="当前筛选下没有费用记录" />}
        </Sheet>
      )}
      {groupOpen && (
        <Sheet
          title="小组合计"
          onClose={() => setGroupOpen(false)}
          footer={
            <View className="group-result">
              <Text>
                {groupIds.length
                  ? `已选 ${groupIds.length} 位伙伴 · 合计应付`
                  : "请选择同行伙伴"}
              </Text>
              <Text className="metric">¥{formatMoney(groupTotal)}</Text>
            </View>
          }
        >
          <Text className="form-intro">
            选择一起结算的伙伴，合并查看最终应付金额。
          </Text>
          <View className="group-choices member-grid">
            {trip.members.map((person) => (
              <Button
                key={person.id}
                className={`group-choice member-option ${groupIds.includes(person.id) ? "selected" : ""}`}
                ariaLabel={person.name}
                ariaSelected={groupIds.includes(person.id)}
                onClick={() =>
                  setGroupIds((ids) =>
                    ids.includes(person.id)
                      ? ids.filter((id) => id !== person.id)
                      : [...ids, person.id],
                  )
                }
              >
                <View className="choice-check">
                  {groupIds.includes(person.id) && <Icon name="check" />}
                </View>
                <Text className="member-choice-label">{person.name}</Text>
              </Button>
            ))}
          </View>
          <Panel
            title="分项合计"
            subtitle={
              groupIds.length
                ? `已选 ${groupIds.length} 人组合`
                : "当前账单 · 公共费用分类"
            }
          >
            {groupCategories.length ? (
              <CategoryBars
                items={groupCategories}
                signed={groupIds.length > 0}
              />
            ) : (
              <Empty
                text={
                  groupIds.length ? "当前组合暂无费用" : "暂无公共费用类别金额"
                }
              />
            )}
            <Text className="group-breakdown-note">
              {groupIds.length
                ? "含公共分摊、出行和个人费用；代付款以负数抵扣，各项相加即为组合应付。"
                : "选择同行伙伴后，查看组合分项与最终应付。"}
            </Text>
          </Panel>
        </Sheet>
      )}
    </View>
  );
}
