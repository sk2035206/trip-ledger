"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { WechatShare } from "../wechat-share";
import { loadRemoteTrip } from "@/frontend/api-client";
import type { LedgerLine, MemberTotal, PersonalExpense, SharedExpense, TravelCost, Trip } from "@/frontend/trip-types";
import {
  calculateTrip,
  formatMoney,
  getMemberCategoryTotals,
  getMemberLedgerItems,
  getMemberName,
  getTripCategoryTotals,
  splitAmount,
} from "@/frontend/trip-utils";

const siteUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL ?? "https://jcxxy.cn/ledger/");
const shareImage = new URL("/api/share-card.png", siteUrl).toString();
const wechatSignatureUrl =
  process.env.NEXT_PUBLIC_WECHAT_SIGNATURE_URL ?? "https://jcxxy.cn/gzh/api/wechat/signature";
const chartColors = ["#174c43", "#b88445", "#d8a24d", "#6f7f69", "#a25f3d", "#52728d", "#8a6a4f"];

type LoadState = {
  loading: boolean;
  trip: Trip | null;
  error: string;
};

export function ShareViewer({ tripId, initialTrip }: { tripId: string; initialTrip: Trip | null }) {
  const [state, setState] = useState<LoadState>(() =>
    initialTrip
      ? { loading: false, trip: initialTrip, error: "" }
      : tripId
      ? { loading: true, trip: null, error: "" }
      : { loading: false, trip: null, error: "分享链接缺少账单 ID" },
  );
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [sharedCategoryFilter, setSharedCategoryFilter] = useState("全部");

  useEffect(() => {
    if (!tripId || initialTrip) return;

    let cancelled = false;

    void loadRemoteTrip(tripId)
      .then((trip) => {
        if (!cancelled) setState({ loading: false, trip, error: "" });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            loading: false,
            trip: null,
            error: error instanceof Error ? error.message : "读取分享账单失败",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialTrip, tripId]);

  useEffect(() => {
    if (!selectedMemberId) return;

    const scrollY = window.scrollY;
    const originalPosition = document.body.style.position;
    const originalTop = document.body.style.top;
    const originalWidth = document.body.style.width;
    const originalOverflow = document.body.style.overflow;

    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.position = originalPosition;
      document.body.style.top = originalTop;
      document.body.style.width = originalWidth;
      document.body.style.overflow = originalOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [selectedMemberId]);

  const totals = useMemo(() => (state.trip ? calculateTrip(state.trip) : null), [state.trip]);
  const selectedMember = useMemo(
    () => state.trip?.members.find((member) => member.id === selectedMemberId) ?? null,
    [selectedMemberId, state.trip],
  );
  const memberLedgerItems = useMemo(
    () => (state.trip && selectedMember ? getMemberLedgerItems(state.trip, selectedMember.id) : []),
    [selectedMember, state.trip],
  );
  const tripCategoryTotals = useMemo(() => (state.trip ? getTripCategoryTotals(state.trip) : []), [state.trip]);
  const selectedGroupTotal = useMemo(() => {
    if (!totals) return 0;
    return selectedGroupIds.reduce((sum, memberId) => {
      const item = totals.memberTotals.find((total) => total.member.id === memberId);
      return sum + (item?.total ?? 0);
    }, 0);
  }, [selectedGroupIds, totals]);
  const selectedGroupLedgerItems = useMemo(
    () => (state.trip ? selectedGroupIds.flatMap((memberId) => getMemberLedgerItems(state.trip as Trip, memberId)) : []),
    [selectedGroupIds, state.trip],
  );
  const selectedGroupCategoryTotals = useMemo(
    () => getMemberCategoryTotals(selectedGroupLedgerItems),
    [selectedGroupLedgerItems],
  );
  const sharedCategoryOptions = useMemo(
    () => (state.trip ? Array.from(new Set(state.trip.sharedExpenses.map((item) => item.category))) : []),
    [state.trip],
  );
  const filteredSharedExpenses = useMemo(() => {
    if (!state.trip) return [];
    if (sharedCategoryFilter === "全部") return state.trip.sharedExpenses;
    return state.trip.sharedExpenses.filter((item) => item.category === sharedCategoryFilter);
  }, [sharedCategoryFilter, state.trip]);
  const shareLink = useMemo(() => {
    if (!tripId) return siteUrl;
    const url = new URL("share", siteUrl);
    url.searchParams.set("tripId", tripId);
    return url.toString();
  }, [tripId]);
  const shareTitle = state.trip ? `${state.trip.title}分账清单` : "旅行分账清单";
  const shareDescription =
    state.trip && totals
      ? `共${state.trip.members.length}人，合计${formatMoney(totals.finalTotal)}，查看本次出行费用明细。`
      : "查看本次旅行费用分账清单。";

  return (
    <main className="app-shell share-shell">
      <WechatShare
        title={shareTitle}
        description={shareDescription}
        link={shareLink}
        imageUrl={shareImage}
        signatureEndpoint={wechatSignatureUrl}
        priority={1}
      />

      {state.loading && <p className="empty">正在读取分享账单...</p>}
      {!state.loading && state.error && <p className="empty">{state.error}</p>}

      {!state.loading && state.trip && totals && (
        <>
          <section className="share-hero">
            <p className="eyebrow">Trip Ledger</p>
            <h1>{state.trip.title}</h1>
            <p className="subtitle">只读分享页，仅用于查看本次出行费用和成员分账结果。</p>
          </section>

          <section className="content-grid">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <span>账单概况</span>
                  <h2>费用统计</h2>
                </div>
              </div>
              <div className="stats-grid">
                <div className="stat">
                  <span>公共费用</span>
                  <strong>{formatMoney(totals.sharedTotal)}</strong>
                </div>
                <div className="stat">
                  <span>出行费用</span>
                  <strong>{formatMoney(totals.travelTotal)}</strong>
                </div>
                <div className="stat">
                  <span>个人费用</span>
                  <strong>{formatMoney(totals.personalTotal)}</strong>
                </div>
                <div className="stat">
                  <span>已付款</span>
                  <strong>{formatMoney(totals.paidTotal)}</strong>
                </div>
                <div className="stat">
                  <span>成员数</span>
                  <strong>{state.trip.members.length}</strong>
                </div>
                <div className="stat">
                  <span>累计费用</span>
                  <strong>{formatMoney(totals.finalTotal)}</strong>
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <span>成员费用</span>
                  <h2>分账清单</h2>
                </div>
              </div>
              <ReadonlySettlement totals={totals.memberTotals} onOpen={setSelectedMemberId} />
            </section>
          </section>

          <section className="content-grid share-stack">
            <ReadonlyPanel title="小组合计" count={selectedGroupIds.length}>
              <div className="selector-grid">
                {state.trip.members.map((member) => (
                  <label key={member.id}>
                    <input
                      type="checkbox"
                      checked={selectedGroupIds.includes(member.id)}
                      onChange={() => setSelectedGroupIds((ids) => toggleIds(ids, member.id))}
                    />
                    <span>{member.name}</span>
                  </label>
                ))}
              </div>
              <div className="group-result">
                <span>
                  {selectedGroupIds.length
                    ? selectedGroupIds.map((id) => getMemberName(state.trip as Trip, id)).join("+")
                    : "请选择成员"}
                </span>
                <strong>{formatMoney(selectedGroupTotal)}</strong>
              </div>
            </ReadonlyPanel>

            <ReadonlyPanel title="分项统计" count={selectedGroupIds.length || tripCategoryTotals.length}>
              <ReadonlyCategoryChart
                items={selectedGroupIds.length ? selectedGroupCategoryTotals : tripCategoryTotals}
                variant={selectedGroupIds.length ? "bars" : "donut"}
                emptyText={selectedGroupIds.length ? "当前组合暂无费用" : "暂无公共费用类别金额"}
              />
            </ReadonlyPanel>
          </section>

          <section className="share-stack">
            <ReadonlyPanel title="公共费用清单" count={filteredSharedExpenses.length}>
              <ReadonlyCategoryFilter
                categories={sharedCategoryOptions}
                activeFilter={sharedCategoryFilter}
                onFilter={setSharedCategoryFilter}
              />
              <ReadonlySharedList trip={state.trip} items={filteredSharedExpenses} />
            </ReadonlyPanel>
            <ReadonlyPanel title="出行费用清单" count={state.trip.travelCosts.length}>
              <ReadonlyTravelList trip={state.trip} items={state.trip.travelCosts} />
            </ReadonlyPanel>
            <ReadonlyPanel title="个人费用清单" count={state.trip.personalExpenses.length}>
              <ReadonlyPersonalList trip={state.trip} items={state.trip.personalExpenses} />
            </ReadonlyPanel>
          </section>

          {selectedMember && (
            <ReadonlyModal title={`${selectedMember.name}个人明细清单`} onClose={() => setSelectedMemberId("")}>
              <ReadonlyMemberDetail items={memberLedgerItems} />
            </ReadonlyModal>
          )}
        </>
      )}
    </main>
  );
}

function ReadonlyPanel({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <span>{count} 项</span>
          <h2>{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

function ReadonlyModal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel" role="dialog" aria-modal="true" aria-label={title}>
        <div className="panel-heading modal-heading">
          <div>
            <span>成员明细</span>
            <h2>{title}</h2>
          </div>
          <button className="modal-close" type="button" aria-label="关闭" onClick={onClose}>
            x
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function ReadonlySettlement({ totals, onOpen }: { totals: MemberTotal[]; onOpen: (id: string) => void }) {
  return (
    <div className="summary-table" role="table" aria-label="成员费用总计">
      <div className="table-row table-head" role="row">
        <span>人员</span>
        <span>总计</span>
        <span>出行</span>
        <span>公共</span>
        <span>个人</span>
        <span>已付抵扣</span>
      </div>
      {totals.map((item) => (
        <button className="table-row table-action" role="row" type="button" key={item.member.id} onClick={() => onOpen(item.member.id)}>
          <span>{item.member.name}</span>
          <strong>{formatMoney(item.total)}</strong>
          <span>{formatMoney(item.travel)}</span>
          <span>{formatMoney(item.shared)}</span>
          <span>{formatMoney(item.personal)}</span>
          <span>{formatMoney(-item.paid)}</span>
        </button>
      ))}
    </div>
  );
}

function ReadonlyMemberDetail({ items }: { items: LedgerLine[] }) {
  if (items.length === 0) return <p className="empty">暂无个人明细</p>;
  return (
    <div className="detail-list">
      {items.map((item) => (
        <article className="detail-line" key={`${item.type}-${item.id}`}>
          <div>
            <strong>{item.title}</strong>
            <span>
              {item.type} / {item.category}
              {item.note ? ` / ${item.note}` : ""}
            </span>
          </div>
          <div>
            <b>{formatMoney(item.amount)}</b>
            <small>原始 {formatMoney(item.sourceAmount)}</small>
          </div>
        </article>
      ))}
    </div>
  );
}

function ReadonlyCategoryChart({
  items,
  variant,
  emptyText = "暂无分项统计",
}: {
  items: Array<{ label: string; amount: number }>;
  variant: "donut" | "bars";
  emptyText?: string;
}) {
  if (items.length === 0) return <p className="empty">{emptyText}</p>;

  const absoluteTotal = items.reduce((sum, item) => sum + Math.abs(item.amount), 0);
  const gradient = items
    .reduce(
      (acc, item, index) => {
        const start = acc.cursor;
        const size = absoluteTotal ? (Math.abs(item.amount) / absoluteTotal) * 100 : 0;
        const end = start + size;
        return {
          cursor: end,
          segments: [...acc.segments, `${chartColors[index % chartColors.length]} ${start}% ${end}%`],
        };
      },
      { cursor: 0, segments: [] as string[] },
    )
    .segments.join(", ");

  if (variant === "bars") {
    return (
      <div className="bar-chart">
        {items.map((item, index) => {
          const percent = absoluteTotal ? (Math.abs(item.amount) / absoluteTotal) * 100 : 0;
          return (
            <div className="bar-row" key={item.label}>
              <div>
                <span>{item.label}</span>
                <strong>{formatMoney(item.amount)}</strong>
              </div>
              <div className="bar-track">
                <i
                  style={
                    {
                      width: `${Math.max(percent, 4)}%`,
                      background: chartColors[index % chartColors.length],
                    } as CSSProperties
                  }
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="chart-card">
      <div className="donut-chart" style={{ "--chart": gradient || "var(--panel-soft)" } as CSSProperties}>
        <span>合计</span>
        <strong>{formatMoney(items.reduce((sum, item) => sum + item.amount, 0))}</strong>
      </div>
      <div className="chart-legend">
        {items.map((item, index) => (
          <div className="legend-row" key={item.label}>
            <i style={{ background: chartColors[index % chartColors.length] }} />
            <span>{item.label}</span>
            <strong>{formatMoney(item.amount)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function toggleIds(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

function ReadonlyCategoryFilter({
  categories,
  activeFilter,
  onFilter,
}: {
  categories: string[];
  activeFilter: string;
  onFilter: (value: string) => void;
}) {
  if (categories.length === 0) return null;
  return (
    <div className="filter-row list-filter">
      <button type="button" className={activeFilter === "全部" ? "active" : ""} onClick={() => onFilter("全部")}>
        全部
      </button>
      {categories.map((category) => (
        <button
          type="button"
          key={category}
          className={activeFilter === category ? "active" : ""}
          onClick={() => onFilter(category)}
        >
          {category}
        </button>
      ))}
    </div>
  );
}

function ReadonlySharedList({ trip, items }: { trip: Trip; items: SharedExpense[] }) {
  if (items.length === 0) return <p className="empty">暂无公共费用</p>;
  return (
    <div className="item-list">
      {items.map((item) => (
        <article className="ledger-item readonly-item" key={item.id}>
          <div className="ledger-main">
            <div className="ledger-title-row">
              <strong>{item.title}</strong>
              <span className="type-tag">{item.category}</span>
            </div>
            <div className="ledger-meta-grid">
              <span>付款人</span>
              <b>{item.payerId ? getMemberName(trip, item.payerId) : "公共"}</b>
              <span>分摊人</span>
              <b>{item.participantIds.map((id) => getMemberName(trip, id)).join("、")}</b>
            </div>
            {item.note && <em>{item.note}</em>}
          </div>
          <div className="item-amount">
            <b>{formatMoney(item.amount)}</b>
            <small>人均 {formatMoney(splitAmount(item.amount, item.participantIds.length))}</small>
          </div>
        </article>
      ))}
    </div>
  );
}

function ReadonlyTravelList({ trip, items }: { trip: Trip; items: TravelCost[] }) {
  if (items.length === 0) return <p className="empty">暂无出行费用</p>;
  return (
    <div className="item-list">
      {items.map((item) => (
        <article className="ledger-item readonly-item" key={item.id}>
          <div className="ledger-main">
            <div className="ledger-title-row">
              <strong>{item.title}</strong>
              <span className="type-tag">出行</span>
            </div>
            <div className="ledger-meta-grid">
              <span>分摊人</span>
              <b>{item.participantIds.map((id) => getMemberName(trip, id)).join("、")}</b>
            </div>
            {item.note && <em>{item.note}</em>}
          </div>
          <div className="item-amount">
            <b>{formatMoney(item.amount)}</b>
            <small>人均 {formatMoney(splitAmount(item.amount, item.participantIds.length))}</small>
          </div>
        </article>
      ))}
    </div>
  );
}

function ReadonlyPersonalList({ trip, items }: { trip: Trip; items: PersonalExpense[] }) {
  if (items.length === 0) return <p className="empty">暂无个人费用</p>;
  return (
    <div className="item-list">
      {items.map((item) => (
        <article className="ledger-item readonly-item" key={item.id}>
          <div className="ledger-main">
            <div className="ledger-title-row">
              <strong>{item.title}</strong>
              <span className="type-tag">个人</span>
            </div>
            <div className="ledger-meta-grid">
              <span>所属人</span>
              <b>{getMemberName(trip, item.memberId)}</b>
              {item.date && (
                <>
                  <span>日期</span>
                  <b>{item.date}</b>
                </>
              )}
            </div>
            {item.note && <em>{item.note}</em>}
          </div>
          <div className="item-amount">
            <b>{formatMoney(item.amount)}</b>
            <small>个人费用</small>
          </div>
        </article>
      ))}
    </div>
  );
}

function normalizeSiteUrl(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}
