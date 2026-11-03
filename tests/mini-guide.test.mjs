import test from "node:test";
import assert from "node:assert/strict";
import {
  createMiniGuideClient,
  guideShareInfo,
  miniGuidePoints,
  miniGuideLines,
  MiniGuideRoutes,
} from "../frontend/travel-guide/mini.ts";
import { createEmptyPlan } from "../frontend/travel-guide/create-plan.ts";

function fixture() {
  const plan = createEmptyPlan("游玩攻略", "长沙", 2);
  plan.places = [
    {
      id: "a",
      name: "酒店",
      type: "hotel",
      city: "长沙",
      source: "user",
      locationStatus: "confirmed",
      coordinate: { lng: 112.9, lat: 28.1, system: "GCJ02" },
    },
    {
      id: "b",
      name: "餐厅",
      type: "food",
      city: "长沙",
      source: "user",
      locationStatus: "confirmed",
      coordinate: { lng: 112.91, lat: 28.11, system: "GCJ02" },
    },
    {
      id: "c",
      name: "待选景点",
      type: "sight",
      city: "长沙",
      source: "user",
      locationStatus: "unresolved",
    },
  ];
  plan.days[0].stops = [
    {
      id: "s1",
      placeId: "a",
      note: "",
      incomingMode: "walking",
      durationMinutes: 60,
    },
    {
      id: "s2",
      placeId: "b",
      note: "",
      incomingMode: "cycling",
      durationMinutes: 90,
    },
    { id: "s3", placeId: "a", note: "返回", incomingMode: "driving" },
  ];
  plan.savedPlaceIds = ["b", "c"];
  return plan;
}
const road = {
  distance: 1000,
  duration: 300,
  points: [
    [112.9, 28.1],
    [112.91, 28.11],
  ],
};
test("native shared guide only reads token-scoped endpoints without a workbench session", async () => {
  const plan = fixture(),
    calls = [];
  const api = createMiniGuideClient(async (path, auth) => {
    calls.push({ path, auth });
    return {
      status: 200,
      data: path.includes("/route?")
        ? road
        : path.includes("/city?")
          ? { center: [110.4, 29.1], zoom: 10 }
          : {
              trip: {
                id: "private",
                title: "同游长沙",
                dates: "2026-10",
                members: ["private-person"],
              },
              plan,
              revision: "private-revision",
            },
    };
  });
  const shared = await api.shared("opaque-token");
  await api.city("长沙", "opaque-token");
  await api.route("112.9,28.1", "112.91,28.11", "cycling", "opaque-token");
  assert.deepEqual(shared.trip, { title: "同游长沙", dates: "2026-10" });
  assert.ok(!JSON.stringify(shared).includes("private"));
  assert.ok(
    calls.every(
      (c) => !c.auth && c.path.startsWith("/api/play-plan-shares/opaque-token"),
    ),
  );
  assert.ok(!calls.some((c) => c.path === "/api/state"));
  assert.match(calls[1].path, /city=%E9%95%BF%E6%B2%99/);
});
test("owner guide uses authenticated GET transport and preserves an empty plan without a sample", async () => {
  const calls = [];
  const api = createMiniGuideClient(async (path, auth) => {
    calls.push({ path, auth });
    return {
      status: 200,
      data: path.endsWith("/share")
        ? { token: "opaque-token" }
        : { trip: { title: "未规划", dates: "" }, plan: null },
    };
  });
  assert.equal((await api.owner("trip-one")).plan, null);
  assert.equal(await api.mint("trip-one"), "opaque-token");
  assert.ok(calls.every((c) => c.auth));
  assert.equal(calls[0].path, "/api/trips/trip-one/play-plan");
});
test("invalid shares, server errors and broken map responses never fall back to sample data", async () => {
  let reads = 0;
  const api = createMiniGuideClient(async () => {
    reads++;
    return { status: 404, data: { error: "分享链接已失效" } };
  });
  for (const token of ["", "../private", "x".repeat(401)])
    await assert.rejects(api.shared(token), /分享链接无效/);
  assert.equal(reads, 0);
  await assert.rejects(api.shared("valid-token"), /已失效/);
  const broken = createMiniGuideClient(async () => ({
    status: 200,
    data: {
      center: [181, 28],
      zoom: 10,
      ...road,
      points: [
        [181, 28],
        [112, 28],
      ],
    },
  }));
  await assert.rejects(broken.city("长沙"), /响应无效/);
  await assert.rejects(broken.route("a", "b", "driving"), /响应无效/);
});
test("native share card keeps an opaque token and never links to an editable page", () => {
  const share = guideShareInfo("同行长沙", "opaque-token");
  assert.equal(share.path, "/pages/play-plan-share/index?token=opaque-token");
  assert.equal(share.title, "同行长沙 · 游玩攻略");
  assert.ok(!share.path.includes("tripId"));
  assert.throws(() => guideShareInfo("长沙", "token&session=secret"));
});
test("native map excludes unresolved places, groups repeated stops and preserves GCJ02 coordinates", () => {
  const plan = fixture(),
    before = JSON.stringify(plan),
    points = miniGuidePoints(plan, plan.days[0].id);
  assert.equal(points.length, 2);
  assert.equal(points[0].label, "1/3");
  assert.equal(points[0].longitude, 112.9);
  assert.equal(points[0].latitude, 28.1);
  assert.equal(new Set(points.map((p) => p.id)).size, points.length);
  assert.deepEqual(
    miniGuidePoints(plan, plan.days[0].id, true).map((p) => p.place.id),
    ["b"],
  );
  assert.equal(JSON.stringify(plan), before);
  const lines = miniGuideLines([
    { status: "success", result: road },
    { status: "manual" },
    { status: "error" },
  ]);
  assert.equal(lines.length, 1);
  assert.deepEqual(lines[0].points[0], { longitude: 112.9, latitude: 28.1 });
});
test("native routes retain partial success, retry failed legs, cache success and never mutate plans", async () => {
  const plan = fixture(),
    before = JSON.stringify(plan),
    planner = new MiniGuideRoutes();
  let calls = 0,
    latest;
  const fetcher = async () => {
    if (++calls === 2) throw new Error("配额不足");
    return road;
  };
  assert.equal(
    await planner.generate(plan, plan.days[0].id, fetcher, (l) => (latest = l)),
    true,
  );
  assert.deepEqual(
    latest.map((l) => l.status),
    ["success", "error"],
  );
  assert.equal(calls, 2);
  await planner.generate(plan, plan.days[0].id, fetcher, (l) => (latest = l));
  assert.equal(calls, 3);
  assert.deepEqual(
    latest.map((l) => l.status),
    ["success", "success"],
  );
  assert.equal(JSON.stringify(plan), before);
});
test("switching days cancels stale native routes and skips manual or unconfirmed legs", async () => {
  const plan = fixture(),
    planner = new MiniGuideRoutes();
  let resolve,
    emissions = 0;
  const pending = planner.generate(
    plan,
    plan.days[0].id,
    () => new Promise((r) => (resolve = r)),
    () => emissions++,
  );
  planner.cancel();
  resolve(road);
  assert.equal(await pending, false);
  assert.equal(emissions, 1);
  plan.days[0].stops[1].incomingMode = "subway";
  plan.days[0].stops[2].placeId = "c";
  let calls = 0,
    latest;
  await planner.generate(
    plan,
    plan.days[0].id,
    async () => {
      calls++;
      return road;
    },
    (l) => (latest = l),
  );
  assert.equal(calls, 0);
  assert.deepEqual(
    latest.map((l) => l.status),
    ["manual", "missing"],
  );
});
