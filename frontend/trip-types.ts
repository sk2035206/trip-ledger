export type Person = {
  id: string;
  name: string;
  note?: string;
};

export type Member = Person;

export type SharedExpense = {
  id: string;
  title: string;
  category: string;
  amount: number;
  participantIds: string[];
  note?: string;
};

export type TravelCost = {
  id: string;
  title: string;
  amount: number;
  participantIds: string[];
  note?: string;
};

export type PersonalExpense = {
  id: string;
  memberId: string;
  title: string;
  amount: number;
  date?: string;
  note?: string;
};

export type Adjustment = {
  id: string;
  memberId: string;
  title: string;
  amount: number;
  note?: string;
};

export type Trip = {
  id: string;
  title: string;
  dates: string;
  members: Member[];
  sharedExpenses: SharedExpense[];
  travelCosts: TravelCost[];
  personalExpenses: PersonalExpense[];
  adjustments: Adjustment[];
};

export type AppState = {
  people: Person[];
  trips: Trip[];
  categories: string[];
};

export type MemberTotal = {
  member: Member;
  shared: number;
  travel: number;
  personal: number;
  adjustment: number;
  total: number;
};

export type LedgerLine = {
  id: string;
  title: string;
  type: "公共" | "出行" | "个人" | "自付";
  category: string;
  amount: number;
  sourceAmount: number;
  note?: string;
};

export type TopView = "workbench" | "trips" | "people" | "categories" | "ledger";
export type LedgerTab = "overview" | "members" | "shared" | "travel" | "personal" | "settlement" | "memberDetail";
