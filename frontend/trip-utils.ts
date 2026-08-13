import { defaultCategories, defaultState } from "./sample-data";
import type { AppState, LedgerLine, MemberTotal, Person, Trip } from "./trip-types";

export function formatMoney(value: number) {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(2);
}

export function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function splitAmount(amount: number, count: number) {
  return count > 0 ? amount / count : 0;
}

export function getMemberName(trip: Trip, memberId: string) {
  return trip.members.find((member) => member.id === memberId)?.name ?? "未知成员";
}

export function migrateTripsToState(
  trips: Trip[],
  seedPeople: Person[] = [],
  seedCategories: string[] = defaultCategories,
): AppState {
  const peopleByName = new Map<string, Person>();
  seedPeople.forEach((person) => {
    const name = person.name.trim();
    if (name && !peopleByName.has(name)) peopleByName.set(name, person);
  });

  trips.forEach((trip) => {
    trip.members.forEach((member) => {
      const name = member.name.trim();
      if (name && !peopleByName.has(name)) peopleByName.set(name, { id: member.id, name });
    });
  });

  const categories = new Set(seedCategories.length ? seedCategories : defaultCategories);
  trips.forEach((trip) => {
    trip.sharedExpenses.forEach((item) => categories.add(item.category));
  });

  const migratedTrips = trips.map((trip) => {
    const idMap = new Map<string, string>();
    const tripMembers = trip.members
      .map((member) => {
        const person = peopleByName.get(member.name.trim());
        if (!person) return null;
        idMap.set(member.id, person.id);
        return person;
      })
      .filter((person): person is Person => Boolean(person));

    return {
      ...trip,
      members: tripMembers,
      sharedExpenses: trip.sharedExpenses.map((item) => ({
        ...item,
        participantIds: replaceIds(item.participantIds, idMap),
      })),
      travelCosts: trip.travelCosts.map((item) => ({
        ...item,
        participantIds: replaceIds(item.participantIds, idMap),
      })),
      personalExpenses: trip.personalExpenses.map((item) => ({
        ...item,
        memberId: idMap.get(item.memberId) ?? item.memberId,
      })),
      adjustments: trip.adjustments.map((item) => ({
        ...item,
        memberId: idMap.get(item.memberId) ?? item.memberId,
      })),
    };
  });

  return {
    people: Array.from(peopleByName.values()),
    trips: migratedTrips,
    categories: Array.from(categories),
  };
}

export function normalizeAppState(value: unknown): AppState {
  if (Array.isArray(value)) return migrateTripsToState(value as Trip[]);

  if (value && typeof value === "object") {
    const candidate = value as Partial<AppState>;
    if (Array.isArray(candidate.trips)) {
      return migrateTripsToState(
        candidate.trips,
        Array.isArray(candidate.people) ? candidate.people : [],
        Array.isArray(candidate.categories) ? candidate.categories : defaultCategories,
      );
    }
  }

  return defaultState;
}

export function calculateTrip(trip: Trip) {
  const memberTotals = trip.members.map<MemberTotal>((member) => {
    const shared = trip.sharedExpenses.reduce((sum, item) => {
      if (!item.participantIds.includes(member.id)) return sum;
      return sum + splitAmount(item.amount, item.participantIds.length);
    }, 0);
    const travelTotal = trip.travelCosts.reduce((sum, item) => {
      if (!item.participantIds.includes(member.id)) return sum;
      return sum + splitAmount(item.amount, item.participantIds.length);
    }, 0);
    const personal = trip.personalExpenses
      .filter((item) => item.memberId === member.id)
      .reduce((sum, item) => sum + item.amount, 0);
    const adjustment = trip.adjustments
      .filter((item) => item.memberId === member.id)
      .reduce((sum, item) => sum + item.amount, 0);

    return {
      member,
      shared,
      travel: travelTotal,
      personal,
      adjustment,
      total: shared + travelTotal + personal + adjustment,
    };
  });

  const sharedTotal = trip.sharedExpenses.reduce((sum, item) => sum + item.amount, 0);
  const travelTotal = trip.travelCosts.reduce((sum, item) => sum + item.amount, 0);
  const personalTotal = trip.personalExpenses.reduce((sum, item) => sum + item.amount, 0);
  const adjustmentTotal = trip.adjustments.reduce((sum, item) => sum + item.amount, 0);
  const expenseTotal = sharedTotal + travelTotal + personalTotal;
  const payableTotal = memberTotals.reduce((sum, item) => sum + item.total, 0);

  return {
    memberTotals,
    sharedTotal,
    travelTotal,
    personalTotal,
    adjustmentTotal,
    expenseTotal,
    finalTotal: expenseTotal,
    payableTotal,
    sharedAverage: splitAmount(sharedTotal, trip.members.length),
  };
}

export function calculateGlobal(state: AppState) {
  return state.trips.reduce(
    (acc, trip) => {
      const total = calculateTrip(trip);
      return {
        tripCount: acc.tripCount + 1,
        peopleCount: state.people.length,
        sharedTotal: acc.sharedTotal + total.sharedTotal,
        travelTotal: acc.travelTotal + total.travelTotal,
        personalTotal: acc.personalTotal + total.personalTotal,
        adjustmentTotal: acc.adjustmentTotal + total.adjustmentTotal,
        finalTotal: acc.finalTotal + total.expenseTotal,
        payableTotal: acc.payableTotal + total.payableTotal,
      };
    },
    {
      tripCount: 0,
      peopleCount: state.people.length,
      sharedTotal: 0,
      travelTotal: 0,
      personalTotal: 0,
      adjustmentTotal: 0,
      finalTotal: 0,
      payableTotal: 0,
    },
  );
}

export function getTripCategoryTotals(trip: Trip) {
  const totals = new Map<string, number>();
  const add = (key: string, amount: number) => totals.set(key, (totals.get(key) ?? 0) + amount);
  trip.sharedExpenses.forEach((item) => add(item.category, item.amount));
  return Array.from(totals.entries()).map(([label, amount]) => ({ label, amount }));
}

export function getGlobalCategoryTotals(trips: Trip[]) {
  const totals = new Map<string, number>();
  trips.forEach((trip) => {
    getTripCategoryTotals(trip).forEach((item) => {
      totals.set(item.label, (totals.get(item.label) ?? 0) + item.amount);
    });
  });
  return Array.from(totals.entries()).map(([label, amount]) => ({ label, amount }));
}

export function getTripExpenseTypeTotals(trip: Trip) {
  const total = calculateTrip(trip);
  return [
    { label: "公共", amount: total.sharedTotal },
    { label: "出行", amount: total.travelTotal },
    { label: "个人", amount: total.personalTotal },
  ].filter((item) => item.amount !== 0);
}

export function getGlobalExpenseTypeTotals(trips: Trip[]) {
  const totals = trips.reduce(
    (acc, trip) => {
      const total = calculateTrip(trip);
      return {
        shared: acc.shared + total.sharedTotal,
        travel: acc.travel + total.travelTotal,
        personal: acc.personal + total.personalTotal,
      };
    },
    { shared: 0, travel: 0, personal: 0 },
  );

  return [
    { label: "公共", amount: totals.shared },
    { label: "出行", amount: totals.travel },
    { label: "个人", amount: totals.personal },
  ].filter((item) => item.amount !== 0);
}

export function getMemberLedgerItems(trip: Trip, memberId: string): LedgerLine[] {
  const shared = trip.sharedExpenses
    .filter((item) => item.participantIds.includes(memberId))
    .map<LedgerLine>((item) => ({
      id: item.id,
      title: item.title,
      type: "公共",
      category: item.category,
      sourceAmount: item.amount,
      amount: splitAmount(item.amount, item.participantIds.length),
      note: `${item.participantIds.length}人分摊`,
    }));
  const travelLines = trip.travelCosts
    .filter((item) => item.participantIds.includes(memberId))
    .map<LedgerLine>((item) => ({
      id: item.id,
      title: item.title,
      type: "出行",
      category: "出行",
      sourceAmount: item.amount,
      amount: splitAmount(item.amount, item.participantIds.length),
      note: item.note,
    }));
  const personal = trip.personalExpenses
    .filter((item) => item.memberId === memberId)
    .map<LedgerLine>((item) => ({
      id: item.id,
      title: item.title,
      type: "个人",
      category: "个人",
      sourceAmount: item.amount,
      amount: item.amount,
      note: item.note,
    }));
  const adjustments = trip.adjustments
    .filter((item) => item.memberId === memberId)
    .map<LedgerLine>((item) => ({
      id: item.id,
      title: item.title,
      type: "自付",
      category: "自付",
      sourceAmount: item.amount,
      amount: item.amount,
      note: item.note,
    }));
  return [...shared, ...travelLines, ...personal, ...adjustments];
}

export function getMemberCategoryTotals(items: LedgerLine[]) {
  const totals = new Map<string, number>();
  items.forEach((item) => totals.set(item.category, (totals.get(item.category) ?? 0) + item.amount));
  return Array.from(totals.entries()).map(([label, amount]) => ({ label, amount }));
}

export function removeTripMember(trip: Trip, memberId: string): Trip {
  return {
    ...trip,
    members: trip.members.filter((member) => member.id !== memberId),
    sharedExpenses: trip.sharedExpenses.map((item) => ({
      ...item,
      participantIds: item.participantIds.filter((id) => id !== memberId),
    })),
    travelCosts: trip.travelCosts.map((item) => ({
      ...item,
      participantIds: item.participantIds.filter((id) => id !== memberId),
    })),
    personalExpenses: trip.personalExpenses.filter((item) => item.memberId !== memberId),
    adjustments: trip.adjustments.filter((item) => item.memberId !== memberId),
  };
}

function replaceIds(ids: string[], idMap: Map<string, string>) {
  return ids.map((id) => idMap.get(id) ?? id);
}
