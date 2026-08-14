"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { loadRemoteState, saveRemoteState } from "@/frontend/api-client";
import { defaultCategories, defaultState } from "@/frontend/sample-data";
import type {
  AppState,
  LedgerLine,
  LedgerTab,
  Member,
  MemberTotal,
  Person,
  PersonalExpense,
  SharedExpense,
  TopView,
  TravelCost,
  Trip,
} from "@/frontend/trip-types";
import {
  calculateGlobal,
  calculateTrip,
  formatMoney,
  getGlobalCategoryTotals,
  getGlobalExpenseTypeTotals,
  getMemberCategoryTotals,
  getMemberLedgerItems,
  getMemberName,
  getTripCategoryTotals,
  removeTripMember,
  splitAmount,
  uid,
} from "@/frontend/trip-utils";

const LEDGER_CACHE_KEYS = ["trip-ledger-v2", "trip-ledger-v1"];
const REMOVED_LOCAL_KEYS = [...LEDGER_CACHE_KEYS, "trip-ledger-api-token"];
const chartColors = ["#174c43", "#b88445", "#d8a24d", "#6f7f69", "#a25f3d", "#52728d", "#8a6a4f"];

export default function Home() {
  const [appState, setAppState] = useState<AppState>(defaultState);
  const [activeView, setActiveView] = useState<TopView>("workbench");
  const [ledgerTab, setLedgerTab] = useState<LedgerTab>("overview");
  const [entryForm, setEntryForm] = useState<"shared" | "travel" | "personal" | null>(null);
  const [createModal, setCreateModal] = useState<"trip" | "person" | "category" | null>(null);
  const [currentTripId, setCurrentTripId] = useState(defaultState.trips[0].id);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string>(defaultState.trips[0].members[0].id);
  const [detailFilter, setDetailFilter] = useState("全部");
  const [copyState, setCopyState] = useState("复制清单");
  const [personName, setPersonName] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [newTripTitle, setNewTripTitle] = useState("");
  const [sharedForm, setSharedForm] = useState({
    title: "",
    amount: "",
    category: defaultCategories[1],
    payerId: "",
    participantIds: defaultState.trips[0].members.map((member) => member.id),
    note: "",
  });
  const [travelForm, setTravelForm] = useState({
    title: "",
    amount: "",
    participantIds: defaultState.trips[0].members.map((member) => member.id),
    note: "",
  });
  const [personalForm, setPersonalForm] = useState({
    memberId: defaultState.trips[0].members[0].id,
    title: "",
    amount: "",
    date: "",
    note: "",
  });
  const hasLoadedRemote = useRef(false);
  const skipNextSave = useRef(false);

  const currentTrip = useMemo(
    () => appState.trips.find((trip) => trip.id === currentTripId) ?? appState.trips[0] ?? defaultState.trips[0],
    [appState.trips, currentTripId],
  );
  const totals = useMemo(() => calculateTrip(currentTrip), [currentTrip]);
  const globalTotals = useMemo(() => calculateGlobal(appState), [appState]);
  const globalCategoryTotals = useMemo(() => getGlobalCategoryTotals(appState.trips), [appState.trips]);
  const globalExpenseTypeTotals = useMemo(() => getGlobalExpenseTypeTotals(appState.trips), [appState.trips]);
  const tripCategoryTotals = useMemo(() => getTripCategoryTotals(currentTrip), [currentTrip]);
  const selectedMember = useMemo(
    () => currentTrip.members.find((member) => member.id === selectedMemberId) ?? currentTrip.members[0],
    [currentTrip.members, selectedMemberId],
  );
  const memberLedgerItems = useMemo(
    () => (selectedMember ? getMemberLedgerItems(currentTrip, selectedMember.id) : []),
    [currentTrip, selectedMember],
  );
  const memberCategoryTotals = useMemo(() => getMemberCategoryTotals(memberLedgerItems), [memberLedgerItems]);
  const filteredMemberItems = useMemo(() => {
    if (detailFilter === "全部") return memberLedgerItems;
    return memberLedgerItems.filter((item) => item.category === detailFilter);
  }, [detailFilter, memberLedgerItems]);

  useEffect(() => {
    let cancelled = false;

    async function loadState() {
      REMOVED_LOCAL_KEYS.forEach((key) => window.localStorage.removeItem(key));

      try {
        const remoteState = await loadRemoteState();
        if (cancelled) return;
        hasLoadedRemote.current = true;
        skipNextSave.current = true;
        setAppState(remoteState);
        setCurrentTripId(remoteState.trips[0]?.id ?? defaultState.trips[0].id);
        setSelectedMemberId(remoteState.trips[0]?.members[0]?.id ?? defaultState.trips[0].members[0].id);
      } catch (error) {
        if (cancelled) return;
        hasLoadedRemote.current = false;
        console.error("[trip-ledger] 后端连接失败", error);
      }
    }

    void loadState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedRemote.current) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      void saveRemoteState(appState)
        .catch((error) => {
          console.error("[trip-ledger] 保存失败", error);
        });
    }, 500);

    return () => window.clearTimeout(timer);
  }, [appState]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const allMemberIds = currentTrip.members.map((member) => member.id);
      const firstMemberId = currentTrip.members[0]?.id ?? "";
      setSharedForm((form) => ({
        ...form,
        category: appState.categories.includes(form.category) ? form.category : appState.categories[0] ?? "其他",
        payerId: allMemberIds.includes(form.payerId) ? form.payerId : "",
        participantIds: form.participantIds.filter((id) => allMemberIds.includes(id)),
      }));
      setTravelForm((form) => ({
        ...form,
        participantIds: form.participantIds.filter((id) => allMemberIds.includes(id)),
      }));
      setPersonalForm((form) => ({
        ...form,
        memberId: allMemberIds.includes(form.memberId) ? form.memberId : firstMemberId,
      }));
      setSelectedGroupIds((ids) => ids.filter((id) => allMemberIds.includes(id)));
      setSelectedMemberId((id) => (allMemberIds.includes(id) ? id : firstMemberId));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [appState.categories, currentTrip.id, currentTrip.members]);

  function updateTrip(updater: (trip: Trip) => Trip) {
    setAppState((state) => ({
      ...state,
      trips: state.trips.map((trip) => (trip.id === currentTrip.id ? updater(trip) : trip)),
    }));
  }

  function openLedger(tripId: string, tab: LedgerTab = "overview") {
    const trip = appState.trips.find((item) => item.id === tripId);
    setCurrentTripId(tripId);
    setSelectedMemberId(trip?.members[0]?.id ?? "");
    setDetailFilter("全部");
    setLedgerTab(tab);
    setActiveView("ledger");
  }

  function openFirstLedger() {
    const firstTrip = appState.trips[0];
    if (!firstTrip) {
      setActiveView("trips");
      return;
    }
    openLedger(firstTrip.id, "overview");
  }

  function createTrip() {
    const title = newTripTitle.trim();
    if (!title) return;
    const trip: Trip = {
      id: uid("trip"),
      title,
      dates: "",
      members: [],
      sharedExpenses: [],
      travelCosts: [],
      personalExpenses: [],
      adjustments: [],
    };
    setAppState((state) => ({ ...state, trips: [trip, ...state.trips] }));
    setCurrentTripId(trip.id);
    setNewTripTitle("");
    setCreateModal(null);
    setActiveView("ledger");
    setLedgerTab("members");
  }

  function addGlobalPerson() {
    const name = personName.trim();
    if (!name) return;
    setAppState((state) => {
      if (state.people.some((person) => person.name === name)) return state;
      return { ...state, people: [...state.people, { id: uid("person"), name }] };
    });
    setPersonName("");
    setCreateModal(null);
  }

  function deleteRosterPerson(personId: string) {
    const isUsed = appState.trips.some((trip) => trip.members.some((member) => member.id === personId));
    if (isUsed) return;
    setAppState((state) => ({
      ...state,
      people: state.people.filter((person) => person.id !== personId),
    }));
  }

  function addTripMember(personId: string) {
    const person = appState.people.find((item) => item.id === personId);
    if (!person) return;
    updateTrip((trip) => {
      if (trip.members.some((member) => member.id === personId)) return trip;
      return { ...trip, members: [...trip.members, person] };
    });
  }

  function removeMemberFromTrip(personId: string) {
    updateTrip((trip) => removeTripMember(trip, personId));
  }

  function addCategory() {
    const name = categoryName.trim();
    if (!name) return;
    setAppState((state) => {
      if (state.categories.includes(name)) return state;
      return { ...state, categories: [...state.categories, name] };
    });
    setCategoryName("");
    setCreateModal(null);
  }

  function deleteCategory(name: string) {
    const isUsed = appState.trips.some((trip) =>
      trip.sharedExpenses.some((item) => item.category === name),
    );
    if (isUsed) return;
    setAppState((state) => ({
      ...state,
      categories: state.categories.filter((category) => category !== name),
    }));
  }

  function addSharedExpense() {
    const amount = Number(sharedForm.amount);
    const title = sharedForm.title.trim();
    if (!title || !amount || sharedForm.participantIds.length === 0) return;
    updateTrip((trip) => ({
      ...trip,
      sharedExpenses: [
        {
          id: uid("shared"),
          title,
          amount,
	          category: sharedForm.category,
	          payerId: sharedForm.payerId || undefined,
	          participantIds: sharedForm.participantIds,
          note: sharedForm.note.trim(),
        },
        ...trip.sharedExpenses,
      ],
	    }));
	    setSharedForm((form) => ({ ...form, title: "", amount: "", note: "" }));
	    setEntryForm(null);
	  }

  function addTravelCost() {
    const amount = Number(travelForm.amount);
    const title = travelForm.title.trim();
    if (!title || !amount || travelForm.participantIds.length === 0) return;
    updateTrip((trip) => ({
      ...trip,
      travelCosts: [
        {
          id: uid("travel"),
          title,
          amount,
          participantIds: travelForm.participantIds,
          note: travelForm.note.trim(),
        },
        ...trip.travelCosts,
      ],
	    }));
	    setTravelForm((form) => ({ ...form, title: "", amount: "", note: "" }));
	    setEntryForm(null);
	  }

  function addPersonalExpense() {
    const amount = Number(personalForm.amount);
    const title = personalForm.title.trim();
    if (!title || !amount || !personalForm.memberId) return;
    updateTrip((trip) => ({
      ...trip,
      personalExpenses: [
        {
          id: uid("personal"),
          memberId: personalForm.memberId,
          title,
          amount,
          date: personalForm.date,
          note: personalForm.note.trim(),
        },
        ...trip.personalExpenses,
      ],
	    }));
	    setPersonalForm((form) => ({ ...form, title: "", amount: "", date: "", note: "" }));
	    setEntryForm(null);
	  }

  function deleteItem(collection: keyof Trip, itemId: string) {
    updateTrip((trip) => {
      const value = trip[collection];
      if (!Array.isArray(value)) return trip;
      return {
        ...trip,
        [collection]: value.filter((item) => "id" in item && item.id !== itemId),
      };
    });
  }

  function toggleIds(ids: string[], id: string) {
    return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
  }

  function setAllParticipants(type: "shared" | "travel") {
    const allIds = currentTrip.members.map((member) => member.id);
    if (type === "shared") {
      setSharedForm((form) => ({ ...form, participantIds: allIds }));
      return;
    }
    setTravelForm((form) => ({ ...form, participantIds: allIds }));
  }

  function openMemberDetail(memberId: string) {
    setSelectedMemberId(memberId);
    setDetailFilter("全部");
    setLedgerTab("memberDetail");
  }

  const selectedGroupTotal = selectedGroupIds.reduce((sum, memberId) => {
    const item = totals.memberTotals.find((total) => total.member.id === memberId);
    return sum + (item?.total ?? 0);
  }, 0);

  const settlementText = useMemo(() => {
    const lines = [
      currentTrip.title,
      "",
      "费用明细",
      ...currentTrip.sharedExpenses.map(
        (item) =>
          `${item.title}｜${formatMoney(item.amount)}｜人均 ${formatMoney(
            splitAmount(item.amount, item.participantIds.length),
          )}`,
      ),
      `公共合计：${formatMoney(totals.sharedTotal)}，参考人均：${formatMoney(totals.sharedAverage)}`,
      "",
      "出行费用",
      ...currentTrip.travelCosts.map(
        (item) =>
          `${item.title}｜${formatMoney(item.amount)}｜人均 ${formatMoney(
            splitAmount(item.amount, item.participantIds.length),
          )}${item.note ? `｜${item.note}` : ""}`,
      ),
      currentTrip.travelCosts.length ? `出行合计：${formatMoney(totals.travelTotal)}` : "暂无出行费用",
      "",
      "个人费用清单",
      ...currentTrip.personalExpenses.map(
        (item) =>
          `${getMemberName(currentTrip, item.memberId)}｜${item.title}｜${formatMoney(
            item.amount,
          )}${item.note ? `｜${item.note}` : ""}`,
      ),
      currentTrip.personalExpenses.length ? `个人费用合计：${formatMoney(totals.personalTotal)}` : "暂无个人费用",
      "",
      "费用总计",
      ...totals.memberTotals.map(
        (item) =>
          `${item.member.name}：总计 ${formatMoney(item.total)}，公共 ${formatMoney(
            item.shared,
	          )}，出行 ${formatMoney(item.travel)}，个人 ${formatMoney(
	            item.personal,
	          )}，已付抵扣 ${formatMoney(item.adjustment - item.paid)}`,
      ),
    ];
    return lines.join("\n");
  }, [currentTrip, totals]);

  async function copySettlement() {
    try {
      await navigator.clipboard.writeText(settlementText);
      setCopyState("已复制");
      window.setTimeout(() => setCopyState("复制清单"), 1600);
    } catch {
      setCopyState("复制失败");
      window.setTimeout(() => setCopyState("复制清单"), 1600);
    }
  }

  return (
    <main className="app-shell">
      <section className={`topbar ${activeView === "ledger" ? "ledger-topbar" : ""}`} aria-label="应用标题">
        <div>
          {activeView !== "ledger" && <p className="eyebrow">Trip Ledger</p>}
          <h1>{activeView === "ledger" ? currentTrip.title : "旅行分账工作台"}</h1>
          {activeView !== "ledger" && <p className="subtitle">全局数据、人员库与出行账单统一归档。</p>}
        </div>

        {activeView === "ledger" ? (
          <div className="trip-switcher">
            <button type="button" className="ghost-button" onClick={() => setActiveView("trips")}>
              返回出行管理
            </button>
            <select
              value={currentTrip.id}
              onChange={(event) => openLedger(event.target.value, "overview")}
            >
              {appState.trips.map((trip) => (
                <option key={trip.id} value={trip.id}>
                  {trip.title}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="trip-switcher">
            <span className="switcher-label">快速入口</span>
            <button type="button" onClick={openFirstLedger}>
              进入账单详情
            </button>
          </div>
        )}
      </section>

      {activeView !== "ledger" && (
        <nav className="app-nav" aria-label="主导航">
          <button
            type="button"
            className={activeView === "workbench" ? "active" : ""}
            onClick={() => setActiveView("workbench")}
          >
            工作台
          </button>
          <button
            type="button"
            className={activeView === "trips" ? "active" : ""}
            onClick={() => setActiveView("trips")}
          >
            出行管理
          </button>
          <button
            type="button"
            className={activeView === "people" ? "active" : ""}
            onClick={() => setActiveView("people")}
          >
            人员管理
          </button>
          <button
            type="button"
            className={activeView === "categories" ? "active" : ""}
            onClick={() => setActiveView("categories")}
          >
            类别管理
          </button>
        </nav>
      )}

      {activeView === "workbench" && (
        <section className="content-grid">
          <Panel title="全局数据" kicker="所有出行账单">
            <div className="stats-grid">
              <Stat label="出行账单" value={`${globalTotals.tripCount}`} />
              <Stat label="累计费用" value={formatMoney(globalTotals.finalTotal)} />
              <Stat label="公共费用" value={formatMoney(globalTotals.sharedTotal)} />
              <Stat label="出行费用" value={formatMoney(globalTotals.travelTotal)} />
              <Stat label="人员库" value={`${globalTotals.peopleCount}`} />
              <Stat label="费用类别" value={`${appState.categories.length}`} />
            </div>
          </Panel>

          <Panel title="金额构成" kicker="全局统计">
            <CategoryChart items={globalExpenseTypeTotals} variant="donut" />
          </Panel>

          <Panel title="管理类" kicker="常用入口">
            <div className="management-grid">
              <button type="button" onClick={() => setActiveView("trips")}>
                <span>出行管理</span>
                <strong>{appState.trips.length} 个账单</strong>
              </button>
              <button type="button" onClick={() => setActiveView("people")}>
                <span>人员管理</span>
                <strong>{appState.people.length} 人</strong>
              </button>
              <button type="button" onClick={() => setActiveView("categories")}>
                <span>类别管理</span>
                <strong>{appState.categories.length} 类</strong>
              </button>
            </div>
          </Panel>
        </section>
      )}

      {activeView === "trips" && (
        <section className="content-grid">
          <Panel title="出行管理" kicker="账单列表">
            <div className="list-toolbar">
              <span>管理每一次旅行账单</span>
              <button type="button" onClick={() => setCreateModal("trip")}>
                新建账单
              </button>
            </div>
            <TripList trips={appState.trips} onOpen={openLedger} />
          </Panel>

          <Panel title="出行分布" kicker="账单金额">
            <TripAmountBars trips={appState.trips} />
          </Panel>
        </section>
      )}

      {activeView === "people" && (
        <section className="content-grid">
          <Panel title="人员管理" kicker="全局人员库">
            <div className="list-toolbar">
              <span>人员只在这里维护，账单内从人员库选择</span>
              <button type="button" onClick={() => setCreateModal("person")}>
                新增人员
              </button>
            </div>
            <RosterList
              people={appState.people}
              trips={appState.trips}
              onDelete={deleteRosterPerson}
            />
          </Panel>

          <Panel title="使用情况" kicker="人员参与账单">
            <PeopleUsage people={appState.people} trips={appState.trips} />
          </Panel>
        </section>
      )}

      {activeView === "categories" && (
        <section className="content-grid">
          <Panel title="类别管理" kicker="公共费用分类">
            <div className="list-toolbar">
              <span>用于公共费用分项统计</span>
              <button type="button" onClick={() => setCreateModal("category")}>
                新增类别
              </button>
            </div>
            <CategoryManager
              categories={appState.categories}
              trips={appState.trips}
              onDelete={deleteCategory}
            />
          </Panel>

          <Panel title="类别金额" kicker="仅公共费用">
            <CategoryChart items={globalCategoryTotals} variant="bars" emptyText="暂无公共费用类别金额" />
          </Panel>
        </section>
      )}

      {activeView === "ledger" && (
        <>
	          <nav className="ledger-tabs" aria-label="账单详情导航">
	            {[
	              ["overview", "总览"],
	              ["settlement", "清单"],
	              ["members", "人员"],
	              ["shared", "公费"],
	              ["travel", "出行"],
	              ["personal", "个人"],
	            ].map(([id, label]) => (
              <button
                type="button"
                key={id}
                className={ledgerTab === id ? "active" : ""}
                onClick={() => setLedgerTab(id as LedgerTab)}
              >
                {label}
              </button>
            ))}
          </nav>

          {ledgerTab === "overview" && (
            <section className="content-grid">
	              <Panel title={currentTrip.title} kicker="账单概况">
	                <div className="stats-grid">
	                  <Stat label="公共总费用" value={formatMoney(totals.sharedTotal)} onClick={() => setLedgerTab("shared")} />
	                  <Stat label="公共参考人均" value={formatMoney(totals.sharedAverage)} onClick={() => setLedgerTab("shared")} />
	                  <Stat label="出行费用" value={formatMoney(totals.travelTotal)} onClick={() => setLedgerTab("travel")} />
	                  <Stat label="个人费用" value={formatMoney(totals.personalTotal)} onClick={() => setLedgerTab("personal")} />
	                  <Stat label="已付款" value={formatMoney(totals.paidTotal + Math.abs(totals.adjustmentTotal))} onClick={() => setLedgerTab("shared")} />
	                  <Stat label="成员数" value={`${currentTrip.members.length}`} onClick={() => setLedgerTab("members")} />
	                </div>
	              </Panel>

	              <Panel title="分项统计" kicker="当前账单">
	                <CategoryChart items={tripCategoryTotals} variant="donut" emptyText="暂无公共费用类别金额" />
	              </Panel>
	            </section>
	          )}

          {ledgerTab === "members" && (
            <section className="content-grid">
              <Panel title="从人员库添加" kicker="全局人员">
                <AvailablePeople
                  people={appState.people}
                  currentTrip={currentTrip}
                  onAdd={addTripMember}
                  onGoPeople={() => setActiveView("people")}
                />
              </Panel>

              <Panel title="本次人员列表" kicker={`${currentTrip.members.length} 人`}>
                <CurrentTripMembers members={currentTrip.members} onRemove={removeMemberFromTrip} />
              </Panel>
            </section>
          )}

	          {ledgerTab === "shared" && (
	            <section className="content-grid">
	              <Panel title="公共费用清单" kicker={`${currentTrip.sharedExpenses.length} 项`}>
	                <div className="list-toolbar">
	                  <span>成员付款会自动抵扣最终应付</span>
	                  <button type="button" onClick={() => setEntryForm("shared")}>
	                    新增公费
	                  </button>
	                </div>
	                <ExpenseList
	                  trip={currentTrip}
	                  items={currentTrip.sharedExpenses}
	                  onDelete={(id) => deleteItem("sharedExpenses", id)}
	                />
	              </Panel>

	            </section>
	          )}

	          {ledgerTab === "travel" && (
	            <section className="content-grid">
	              <Panel title="出行费用清单" kicker={`${currentTrip.travelCosts.length} 项`}>
	                <div className="list-toolbar">
	                  <span>车票、机票、城际交通等单独分摊</span>
	                  <button type="button" onClick={() => setEntryForm("travel")}>
	                    新增出行
	                  </button>
	                </div>
	                <TravelList
	                  trip={currentTrip}
	                  items={currentTrip.travelCosts}
	                  onDelete={(id) => deleteItem("travelCosts", id)}
	                />
	              </Panel>

	            </section>
	          )}

	          {ledgerTab === "personal" && (
	            <section className="content-grid">
	              <Panel title="个人费用清单" kicker="不计入公共总费用">
	                <div className="list-toolbar">
	                  <span>只计入成员个人清单，不进入公共总费用</span>
	                  <button type="button" onClick={() => setEntryForm("personal")}>
	                    新增个人
	                  </button>
	                </div>
	                <PersonalList
	                  trip={currentTrip}
	                  items={currentTrip.personalExpenses}
	                  onDelete={(id) => deleteItem("personalExpenses", id)}
	                />
	              </Panel>

	            </section>
	          )}

          {ledgerTab === "settlement" && (
            <section className="content-grid settlement-grid">
              <Panel title="最终分账清单" kicker="成员费用">
                <SettlementTable totals={totals.memberTotals} onOpen={openMemberDetail} />
                <button className="copy-button" type="button" onClick={copySettlement}>
                  {copyState}
                </button>
              </Panel>

	              <Panel title="小组合计" kicker="组合计算">
	                <div className="selector-grid">
                  {currentTrip.members.map((member) => (
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
                      ? selectedGroupIds.map((id) => getMemberName(currentTrip, id)).join("+")
                      : "请选择成员"}
                  </span>
                  <strong>{formatMoney(selectedGroupTotal)}</strong>
                </div>
              </Panel>

	              <Panel title="分项统计" kicker="当前账单">
	                <CategoryChart items={tripCategoryTotals} variant="donut" emptyText="暂无公共费用类别金额" />
	              </Panel>
	            </section>
	          )}

	          {ledgerTab === "memberDetail" && (
	            <section className="member-detail-page">
	              <Panel title={selectedMember ? `${selectedMember.name}的清单` : "成员清单"} kicker="成员明细">
	                <div className="detail-toolbar">
	                  <button type="button" className="ghost-button" onClick={() => setLedgerTab("settlement")}>
	                    返回清单
	                  </button>
	                  <button type="button" className="ghost-button" onClick={() => setLedgerTab("overview")}>
	                    返回总览
	                  </button>
	                </div>
	                {selectedMember ? (
	                  <MemberDetail
	                    items={filteredMemberItems}
	                    categories={memberCategoryTotals}
	                    activeFilter={detailFilter}
	                    onFilter={setDetailFilter}
	                  />
	                ) : (
	                  <Empty text="请选择成员查看明细" />
	                )}
	              </Panel>
	            </section>
	          )}
        </>
      )}

      {createModal === "trip" && (
        <Modal title="新建账单" kicker="出行管理" onClose={() => setCreateModal(null)}>
          <div className="form-grid single-form">
            <input
              value={newTripTitle}
              onChange={(event) => setNewTripTitle(event.target.value)}
              placeholder="新出行账单名称"
            />
          </div>
          <div className="form-footer">
            <button type="button" className="ghost-button" onClick={() => setCreateModal(null)}>
              取消
            </button>
            <button type="button" onClick={createTrip}>
              保存账单
            </button>
          </div>
        </Modal>
      )}

      {createModal === "person" && (
        <Modal title="新增人员" kicker="人员管理" onClose={() => setCreateModal(null)}>
          <div className="form-grid single-form">
            <input
              value={personName}
              onChange={(event) => setPersonName(event.target.value)}
              placeholder="人员姓名"
            />
          </div>
          <div className="form-footer">
            <button type="button" className="ghost-button" onClick={() => setCreateModal(null)}>
              取消
            </button>
            <button type="button" onClick={addGlobalPerson}>
              保存人员
            </button>
          </div>
        </Modal>
      )}

      {createModal === "category" && (
        <Modal title="新增类别" kicker="类别管理" onClose={() => setCreateModal(null)}>
          <div className="form-grid single-form">
            <input
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
              placeholder="类别名称，如住宿/餐饮"
            />
          </div>
          <div className="form-footer">
            <button type="button" className="ghost-button" onClick={() => setCreateModal(null)}>
              取消
            </button>
            <button type="button" onClick={addCategory}>
              保存类别
            </button>
          </div>
        </Modal>
      )}

      {entryForm === "shared" && (
        <Modal title="公共费用录入" kicker="多人分摊" onClose={() => setEntryForm(null)}>
          <div className="form-grid">
            <input
              value={sharedForm.title}
              onChange={(event) => setSharedForm((form) => ({ ...form, title: event.target.value }))}
              placeholder="事项，如酒店/海鲜馆"
            />
            <input
              inputMode="decimal"
              value={sharedForm.amount}
              onChange={(event) => setSharedForm((form) => ({ ...form, amount: event.target.value }))}
              placeholder="金额"
            />
            <select
              value={sharedForm.category}
              onChange={(event) => setSharedForm((form) => ({ ...form, category: event.target.value }))}
            >
              {appState.categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
            <select
              value={sharedForm.payerId}
              onChange={(event) => setSharedForm((form) => ({ ...form, payerId: event.target.value }))}
            >
              <option value="">公共付款</option>
              {currentTrip.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
            <input
              className="wide-field"
              value={sharedForm.note}
              onChange={(event) => setSharedForm((form) => ({ ...form, note: event.target.value }))}
              placeholder="备注，可选"
            />
          </div>
          <ParticipantPicker
            members={currentTrip.members}
            selectedIds={sharedForm.participantIds}
            onToggle={(id) =>
              setSharedForm((form) => ({
                ...form,
                participantIds: toggleIds(form.participantIds, id),
              }))
            }
            onSelectAll={() => setAllParticipants("shared")}
          />
          <div className="form-footer">
            <span>
              该项人均：
              {formatMoney(splitAmount(Number(sharedForm.amount), sharedForm.participantIds.length))}
            </span>
            <button type="button" className="ghost-button" onClick={() => setEntryForm(null)}>
              取消
            </button>
            <button type="button" onClick={addSharedExpense}>
              保存公共费用
            </button>
          </div>
        </Modal>
      )}

      {entryForm === "travel" && (
        <Modal title="出行费用录入" kicker="车票/机票/城际交通" onClose={() => setEntryForm(null)}>
          <div className="form-grid">
            <input
              value={travelForm.title}
              onChange={(event) => setTravelForm((form) => ({ ...form, title: event.target.value }))}
              placeholder="行程，如青岛-长沙往返"
            />
            <input
              inputMode="decimal"
              value={travelForm.amount}
              onChange={(event) => setTravelForm((form) => ({ ...form, amount: event.target.value }))}
              placeholder="金额"
            />
            <input
              className="wide-field"
              value={travelForm.note}
              onChange={(event) => setTravelForm((form) => ({ ...form, note: event.target.value }))}
              placeholder="公式或备注，如789+789=1578"
            />
          </div>
          <ParticipantPicker
            members={currentTrip.members}
            selectedIds={travelForm.participantIds}
            onToggle={(id) =>
              setTravelForm((form) => ({
                ...form,
                participantIds: toggleIds(form.participantIds, id),
              }))
            }
            onSelectAll={() => setAllParticipants("travel")}
          />
          <div className="form-footer">
            <span>
              该项人均：
              {formatMoney(splitAmount(Number(travelForm.amount), travelForm.participantIds.length))}
            </span>
            <button type="button" className="ghost-button" onClick={() => setEntryForm(null)}>
              取消
            </button>
            <button type="button" onClick={addTravelCost}>
              保存出行费用
            </button>
          </div>
        </Modal>
      )}

      {entryForm === "personal" && (
        <Modal title="个人费用录入" kicker="成员个人花销" onClose={() => setEntryForm(null)}>
          <div className="form-grid">
            <select
              value={personalForm.memberId}
              onChange={(event) => setPersonalForm((form) => ({ ...form, memberId: event.target.value }))}
            >
              {currentTrip.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
            <input
              value={personalForm.title}
              onChange={(event) => setPersonalForm((form) => ({ ...form, title: event.target.value }))}
              placeholder="个人事项"
            />
            <input
              inputMode="decimal"
              value={personalForm.amount}
              onChange={(event) => setPersonalForm((form) => ({ ...form, amount: event.target.value }))}
              placeholder="金额"
            />
            <input
              value={personalForm.date}
              onChange={(event) => setPersonalForm((form) => ({ ...form, date: event.target.value }))}
              placeholder="日期，可选"
            />
            <input
              className="wide-field"
              value={personalForm.note}
              onChange={(event) => setPersonalForm((form) => ({ ...form, note: event.target.value }))}
              placeholder="备注/公式，可选"
            />
          </div>
          <div className="form-footer">
            <span>会计入该成员个人合计，不进入公共总费用</span>
            <button type="button" className="ghost-button" onClick={() => setEntryForm(null)}>
              取消
            </button>
            <button type="button" onClick={addPersonalExpense}>
              保存个人费用
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}

function Modal({
  title,
  kicker,
  children,
  onClose,
}: {
  title: string;
  kicker: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <section
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="panel-heading modal-heading">
          <div>
            <span>{kicker}</span>
            <h2>{title}</h2>
          </div>
          <button type="button" className="modal-close" aria-label="关闭弹窗" onClick={onClose}>
            x
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function Panel({
  title,
  kicker,
  children,
}: {
  title: string;
  kicker: string;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <span>{kicker}</span>
          <h2>{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  const content = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className="stat stat-action" onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className="stat">{content}</div>;
}

function Empty({ text }: { text: string }) {
  return <p className="empty">{text}</p>;
}

function TripList({ trips, onOpen }: { trips: Trip[]; onOpen: (id: string) => void }) {
  if (trips.length === 0) return <Empty text="暂无出行账单" />;
  return (
    <div className="trip-list">
      {trips.map((trip) => {
        const totals = calculateTrip(trip);
        return (
          <button className="trip-card" type="button" key={trip.id} onClick={() => onOpen(trip.id)}>
            <div>
              <strong>{trip.title}</strong>
              <span>{trip.members.length} 人 / {trip.sharedExpenses.length + trip.travelCosts.length + trip.personalExpenses.length} 项费用</span>
            </div>
            <b>{formatMoney(totals.finalTotal)}</b>
          </button>
        );
      })}
    </div>
  );
}

function TripAmountBars({ trips }: { trips: Trip[] }) {
  const items = trips.map((trip) => ({ label: trip.title, amount: calculateTrip(trip).finalTotal }));
  return <CategoryChart items={items} variant="bars" />;
}

function PeopleUsage({ people, trips }: { people: Person[]; trips: Trip[] }) {
  if (people.length === 0) return <Empty text="暂无人员" />;
  return (
    <div className="roster-list">
      {people.map((person) => {
        const count = trips.filter((trip) => trip.members.some((member) => member.id === person.id)).length;
        return (
          <article className="roster-row" key={person.id}>
            <div>
              <strong>{person.name}</strong>
              <span>{count ? `参与 ${count} 个账单` : "尚未参与账单"}</span>
            </div>
            <b>{count}</b>
          </article>
        );
      })}
    </div>
  );
}

function RosterList({
  people,
  trips,
  onDelete,
}: {
  people: Person[];
  trips: Trip[];
  onDelete: (id: string) => void;
}) {
  if (people.length === 0) return <Empty text="暂无全局人员" />;
  return (
    <div className="roster-list">
      {people.map((person) => {
        const usedCount = trips.filter((trip) => trip.members.some((member) => member.id === person.id)).length;
        return (
          <article className="roster-row" key={person.id}>
            <div>
              <strong>{person.name}</strong>
              <span>{usedCount ? `已用于 ${usedCount} 个账本` : "未加入任何账本"}</span>
            </div>
            <button
              type="button"
              className="ghost-danger"
              disabled={usedCount > 0}
              onClick={() => onDelete(person.id)}
            >
              删除
            </button>
          </article>
        );
      })}
    </div>
  );
}

function CategoryManager({
  categories,
  trips,
  onDelete,
}: {
  categories: string[];
  trips: Trip[];
  onDelete: (name: string) => void;
}) {
  if (categories.length === 0) return <Empty text="暂无费用类别" />;
  return (
    <div className="roster-list">
      {categories.map((category) => {
        const count = trips.reduce(
          (sum, trip) => sum + trip.sharedExpenses.filter((item) => item.category === category).length,
          0,
        );
        return (
          <article className="roster-row" key={category}>
            <div>
              <strong>{category}</strong>
              <span>{count ? `已用于 ${count} 项公共费用` : "暂未使用"}</span>
            </div>
            <button type="button" className="ghost-danger" disabled={count > 0} onClick={() => onDelete(category)}>
              删除
            </button>
          </article>
        );
      })}
    </div>
  );
}

function AvailablePeople({
  people,
  currentTrip,
  onAdd,
  onGoPeople,
}: {
  people: Person[];
  currentTrip: Trip;
  onAdd: (id: string) => void;
  onGoPeople: () => void;
}) {
  const available = people.filter((person) => !currentTrip.members.some((member) => member.id === person.id));
  if (people.length === 0) {
    return (
      <div>
        <Empty text="人员库为空，请先到人员管理新增人员" />
        <button className="copy-button" type="button" onClick={onGoPeople}>
          去人员管理
        </button>
      </div>
    );
  }
  if (available.length === 0) return <Empty text="人员库中的人员都已加入本次账单" />;
  return (
    <div className="roster-list">
      {available.map((person) => (
        <article className="roster-row" key={person.id}>
          <div>
            <strong>{person.name}</strong>
            <span>来自全局人员库</span>
          </div>
          <button type="button" onClick={() => onAdd(person.id)}>
            添加
          </button>
        </article>
      ))}
    </div>
  );
}

function CurrentTripMembers({ members, onRemove }: { members: Member[]; onRemove: (id: string) => void }) {
  if (members.length === 0) return <Empty text="请从左侧人员库添加本次人员" />;
  return (
    <div className="roster-list">
      {members.map((member) => (
        <article className="roster-row" key={member.id}>
          <div>
            <strong>{member.name}</strong>
            <span>本次出行成员</span>
          </div>
          <button type="button" className="ghost-danger" onClick={() => onRemove(member.id)}>
            移除
          </button>
        </article>
      ))}
    </div>
  );
}

function SettlementTable({ totals, onOpen }: { totals: MemberTotal[]; onOpen: (id: string) => void }) {
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
        <button className="table-row table-action" role="row" key={item.member.id} type="button" onClick={() => onOpen(item.member.id)}>
          <span>{item.member.name}</span>
          <strong>{formatMoney(item.total)}</strong>
          <span>{formatMoney(item.travel)}</span>
          <span>{formatMoney(item.shared)}</span>
          <span>{formatMoney(item.personal)}</span>
	          <span>{formatMoney(item.adjustment - item.paid)}</span>
        </button>
      ))}
    </div>
  );
}

function CategoryChart({
  items,
  variant,
  emptyText = "暂无分项统计",
}: {
  items: Array<{ label: string; amount: number }>;
  variant: "donut" | "bars";
  emptyText?: string;
}) {
  if (items.length === 0) return <Empty text={emptyText} />;

  const absoluteTotal = items.reduce((sum, item) => sum + Math.abs(item.amount), 0);
  const gradient = items
    .reduce(
      (acc, item, index) => {
        const start = acc.cursor;
        const size = absoluteTotal ? (Math.abs(item.amount) / absoluteTotal) * 100 : 0;
        const end = start + size;
        return {
          cursor: end,
          segments: [
            ...acc.segments,
            `${chartColors[index % chartColors.length]} ${start}% ${end}%`,
          ],
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

function ParticipantPicker({
  members,
  selectedIds,
  onToggle,
  onSelectAll,
}: {
  members: Member[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSelectAll: () => void;
}) {
  return (
    <div className="picker">
      <div className="picker-title">
        <span>参与人员</span>
        <button type="button" onClick={onSelectAll}>
          全选
        </button>
      </div>
      <div className="selector-grid">
        {members.map((member) => (
          <label key={member.id}>
            <input type="checkbox" checked={selectedIds.includes(member.id)} onChange={() => onToggle(member.id)} />
            <span>{member.name}</span>
          </label>
        ))}
      </div>
      {members.length === 0 && <Empty text="先从人员库添加本次出行人员" />}
    </div>
  );
}

function ExpenseList({ trip, items, onDelete }: { trip: Trip; items: SharedExpense[]; onDelete: (id: string) => void }) {
  if (items.length === 0) return <Empty text="暂无公共费用" />;
  return (
    <div className="item-list">
	      {items.map((item) => (
	        <article className="ledger-item" key={item.id}>
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
            <small>人均 {formatMoney(splitAmount(item.amount, item.participantIds.length))}</small>
            <b>{formatMoney(item.amount)}</b>
          </div>
          <button type="button" aria-label={`删除${item.title}`} onClick={() => onDelete(item.id)}>
            x
          </button>
        </article>
      ))}
    </div>
  );
}

function TravelList({ trip, items, onDelete }: { trip: Trip; items: TravelCost[]; onDelete: (id: string) => void }) {
  if (items.length === 0) return <Empty text="暂无出行费用" />;
  return (
    <div className="item-list">
      {items.map((item) => (
        <article className="ledger-item" key={item.id}>
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
            <small>人均 {formatMoney(splitAmount(item.amount, item.participantIds.length))}</small>
            <b>{formatMoney(item.amount)}</b>
          </div>
          <button type="button" aria-label={`删除${item.title}`} onClick={() => onDelete(item.id)}>
            x
          </button>
        </article>
      ))}
    </div>
  );
}

function PersonalList({ trip, items, onDelete }: { trip: Trip; items: PersonalExpense[]; onDelete: (id: string) => void }) {
  if (items.length === 0) return <Empty text="暂无个人费用" />;
  return (
    <div className="item-list">
      {items.map((item) => (
        <article className="ledger-item" key={item.id}>
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
            <small>个人费用</small>
            <b>{formatMoney(item.amount)}</b>
          </div>
          <button type="button" aria-label={`删除${item.title}`} onClick={() => onDelete(item.id)}>
            x
          </button>
        </article>
      ))}
    </div>
  );
}

function MemberDetail({
  items,
  categories,
  activeFilter,
  onFilter,
  compact = false,
}: {
  items: LedgerLine[];
  categories: Array<{ label: string; amount: number }>;
  activeFilter: string;
  onFilter: (value: string) => void;
  compact?: boolean;
}) {
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  return (
    <div className={compact ? "member-detail compact-detail" : "member-detail"}>
      <div className="detail-hero">
        <span>筛选后合计</span>
        <strong>{formatMoney(total)}</strong>
      </div>
      <CategoryChart items={categories} variant="bars" />
      <div className="filter-row">
        <button type="button" className={activeFilter === "全部" ? "active" : ""} onClick={() => onFilter("全部")}>
          全部
        </button>
        {categories.map((item) => (
          <button
            type="button"
            key={item.label}
            className={activeFilter === item.label ? "active" : ""}
            onClick={() => onFilter(item.label)}
          >
            {item.label} {formatMoney(item.amount)}
          </button>
        ))}
      </div>
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
              <small>原金额 {formatMoney(item.sourceAmount)}</small>
            </div>
          </article>
        ))}
      </div>
      {items.length === 0 && <Empty text="当前筛选下暂无费用" />}
    </div>
  );
}
