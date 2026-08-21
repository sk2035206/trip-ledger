import type { AppState, Person, SharedExpense, TravelCost } from "./trip-types";

export const defaultCategories = ["酒店", "吃玩", "交通", "门票", "其他"];

export const samplePeople: Person[] = [
  { id: "maq", name: "马科" },
  { id: "daj", name: "大婧" },
  { id: "laoz", name: "老周" },
  { id: "xiaom", name: "小妹" },
  { id: "renz", name: "任哲" },
  { id: "tianh", name: "田慧" },
];

export const defaultState: AppState = {
  people: samplePeople,
  trips: [
    {
      id: "qinhuangdao-2026",
      title: "2026秦皇岛游玩费用",
      dates: "2026",
      members: members(["maq", "daj", "laoz", "xiaom", "renz", "tianh"]),
      sharedExpenses: [
        expense("酒店", 2790, "酒店", ["maq", "daj", "laoz", "xiaom", "renz", "tianh"]),
        expense("叶存利", 384, "吃玩", ["maq", "daj", "laoz", "xiaom", "renz", "tianh"]),
        expense("鸽子窝", 192, "门票", ["maq", "daj", "laoz", "xiaom", "renz", "tianh"]),
        expense("碰碰车", 90, "吃玩", ["maq", "daj", "laoz", "xiaom", "renz", "tianh"]),
        expense("海鲜馆", 540, "吃玩", ["maq", "daj", "laoz", "xiaom", "renz", "tianh"]),
        expense("早餐", 90, "吃玩", ["maq", "daj", "laoz", "xiaom", "renz", "tianh"]),
        expense("老龙头", 354, "门票", ["maq", "daj", "laoz", "xiaom", "renz", "tianh"]),
        expense("孟家店", 408, "吃玩", ["maq", "daj", "laoz", "xiaom", "renz", "tianh"]),
        expense("三蹦子", 30, "交通", ["maq", "daj", "laoz", "xiaom", "renz", "tianh"]),
        expense("家常馆", 318, "吃玩", ["maq", "daj", "laoz", "xiaom", "renz", "tianh"]),
        expense("打车", 474, "交通", ["maq", "daj", "laoz", "xiaom", "renz", "tianh"]),
      ],
      travelCosts: [],
      personalExpenses: [],
    },
    {
      id: "changsha-zhangjiajie-2026",
      title: "2026长沙-张家界游玩费用",
      dates: "2026",
      members: members(["daj", "maq", "renz", "tianh", "laoz"]),
      sharedExpenses: [
        expense("胖冬瓜", 200, "吃玩", ["daj", "maq", "renz", "tianh", "laoz"]),
        expense("小龙虾", 455, "吃玩", ["daj", "maq", "renz", "tianh", "laoz"]),
        expense("亚朵", 1320, "酒店", ["daj", "maq", "renz", "tianh", "laoz"]),
        expense("土菜馆", 350, "吃玩", ["daj", "maq", "renz", "tianh", "laoz"]),
        expense("武陵源", 1195, "门票", ["daj", "maq", "renz", "tianh", "laoz"]),
        expense("牛肉馆", 180, "吃玩", ["daj", "maq", "renz", "tianh", "laoz"]),
        expense("零食", 80, "吃玩", ["daj", "maq", "renz", "tianh", "laoz"]),
        expense("宜必思", 1970, "酒店", ["daj", "maq", "renz", "tianh", "laoz"]),
        expense("山天梯", 325, "门票", ["daj", "maq", "renz", "tianh", "laoz"]),
        expense("山索道", 360, "门票", ["daj", "maq", "renz", "tianh", "laoz"]),
        expense("毛小馆", 255, "吃玩", ["daj", "maq", "renz", "tianh", "laoz"]),
        expense("桔子", 1770, "酒店", ["daj", "maq", "renz", "tianh", "laoz"]),
        expense("天门山", 1370, "门票", ["daj", "maq", "renz", "tianh", "laoz"]),
        expense("山扶梯", 160, "门票", ["daj", "maq", "renz", "tianh", "laoz"]),
        expense("玻璃栈道", 25, "门票", ["daj", "maq", "renz", "tianh", "laoz"]),
        expense("观光缆车", 125, "交通", ["daj", "maq", "renz", "tianh", "laoz"]),
        expense("总打车", 365, "交通", ["daj", "maq", "renz", "tianh", "laoz"]),
        expense("醉湘楼", 285, "吃玩", ["daj", "maq", "renz", "tianh", "laoz"]),
        expense("亚朵", 1095, "酒店", ["daj", "maq", "renz", "tianh", "laoz"]),
      ],
      travelCosts: [
        travel("青岛-长沙往返", 1578, ["daj"], "789+789=1578"),
        travel("北京-长沙往返", 1308, ["maq"], "472+836=1308"),
        travel("杭州-长沙往返", 1038, ["renz", "tianh"], "485+553=1038"),
        travel("长沙-张家界往返", 332, ["daj", "maq", "renz", "tianh", "laoz"], "166+166=332"),
      ],
      personalExpenses: [
        {
          id: "pe-maq",
          memberId: "maq",
          title: "4-30自付酒店/口味虾/奶茶/粉/桂林卤粉",
          amount: 1340,
          note: "286+276+10+336+200+136+96",
        },
      ],
    },
  ],
  categories: defaultCategories,
};

function members(ids: string[]) {
  return ids
    .map((id) => samplePeople.find((person) => person.id === id))
    .filter((person): person is Person => Boolean(person));
}

function expense(
  title: string,
  amount: number,
  category: string,
  participantIds: string[],
): SharedExpense {
  return {
    id: `shared-${title}-${amount}-${participantIds.join("-")}`,
    title,
    amount,
    category,
    participantIds,
  };
}

function travel(
  title: string,
  amount: number,
  participantIds: string[],
  note?: string,
): TravelCost {
  return {
    id: `travel-${title}-${amount}-${participantIds.join("-")}`,
    title,
    amount,
    participantIds,
    note,
  };
}
