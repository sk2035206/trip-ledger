import { parsePlan, routeLegs, coordinateText } from "./plan";
import type { TripPlan, Place, RouteLeg, RouteResult } from "./types";

export type GuideSnapshot = {
  trip: { title: string; dates: string };
  plan: TripPlan | null;
};
type Transport = (
  path: string,
  authenticated: boolean,
) => Promise<{ status: number; data: unknown }>;
function query(values: Record<string, string>) {
  return Object.entries(values)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("攻略响应无效");
  return value as Record<string, unknown>;
}
export function validGuideToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 400 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}
export function guideShareInfo(title: string, token: string) {
  if (!validGuideToken(token)) throw new Error("分享链接无效");
  return {
    title: `${title} · 游玩攻略`,
    path: `/pages/play-plan-share/index?token=${encodeURIComponent(token)}`,
    imageUrl: "/assets/share-card.png",
  };
}
export function createMiniGuideClient(transport: Transport) {
  async function get(path: string, authenticated: boolean) {
    const response = await transport(path, authenticated);
    const body = object(response.data);
    if (response.status !== 200)
      throw new Error(
        typeof body.error === "string" ? body.error : "攻略暂时无法读取",
      );
    return body;
  }
  function snapshot(
    body: Record<string, unknown>,
    shared = false,
  ): GuideSnapshot {
    const trip = object(body.trip);
    if (typeof trip.title !== "string" || typeof trip.dates !== "string")
      throw new Error("攻略信息无效");
    if (shared && body.plan === null) throw new Error("此攻略暂时无法查看");
    return {
      trip: { title: trip.title, dates: trip.dates },
      plan: body.plan === null ? null : parsePlan(body.plan),
    };
  }
  function sharedBase(token: string) {
    if (!validGuideToken(token)) throw new Error("分享链接无效");
    return `/api/play-plan-shares/${encodeURIComponent(token)}`;
  }
  return {
    async owner(tripId: string) {
      if (!tripId || tripId.length > 64)
        throw new Error("请从出行详情打开游玩攻略");
      return snapshot(
        await get(`/api/trips/${encodeURIComponent(tripId)}/play-plan`, true),
      );
    },
    async shared(token: string) {
      return snapshot(await get(sharedBase(token), false), true);
    },
    async mint(tripId: string) {
      const body = await get(
        `/api/trips/${encodeURIComponent(tripId)}/play-plan/share`,
        true,
      );
      if (!validGuideToken(body.token)) throw new Error("暂时无法生成分享链接");
      return body.token;
    },
    async city(city: string, token?: string) {
      const body = await get(
        `${token ? sharedBase(token) + "/maps" : "/api/maps"}/city?${query({ city })}`,
        !token,
      );
      const center = body.center;
      if (
        !Array.isArray(center) ||
        center.length !== 2 ||
        !validPoint(center) ||
        typeof body.zoom !== "number" ||
        !Number.isFinite(body.zoom) ||
        body.zoom < 3 ||
        body.zoom > 20
      )
        throw new Error("城市定位响应无效");
      return { center: center as [number, number], zoom: body.zoom };
    },
    async route(
      origin: string,
      destination: string,
      mode: string,
      token?: string,
    ): Promise<RouteResult> {
      const body = await get(
        `${token ? sharedBase(token) + "/maps" : "/api/maps"}/route?${query({ origin, destination, mode })}`,
        !token,
      );
      if (
        typeof body.distance !== "number" ||
        !Number.isFinite(body.distance) ||
        body.distance < 0 ||
        typeof body.duration !== "number" ||
        !Number.isFinite(body.duration) ||
        body.duration < 0 ||
        !Array.isArray(body.points) ||
        body.points.length < 2 ||
        !body.points.every(validPoint)
      )
        throw new Error("路线响应无效");
      return {
        distance: body.distance,
        duration: body.duration,
        points: body.points as [number, number][],
      };
    },
  };
}
function validPoint(value: unknown) {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 90
  );
}
export function miniGuidePoints(plan: TripPlan, dayId: string, saved = false) {
  const places = new Map(plan.places.map((p) => [p.id, p]));
  const ordered = saved
    ? plan.savedPlaceIds.map((id) => ({ place: places.get(id)!, label: "" }))
    : (plan.days
        .find((d) => d.id === dayId)
        ?.stops.map((s, i) => ({
          place: places.get(s.placeId)!,
          label: String(i + 1),
        })) ?? []);
  const unique = new Map<string, { place: Place; labels: string[] }>();
  for (const { place, label } of ordered) {
    if (place?.locationStatus !== "confirmed" || !place.coordinate) continue;
    const current = unique.get(place.id);
    if (current) {
      if (label) current.labels.push(label);
    } else unique.set(place.id, { place, labels: label ? [label] : [] });
  }
  return [...unique.values()].map(({ place, labels }, i) => ({
    id: i + 1,
    place,
    latitude: place.coordinate!.lat,
    longitude: place.coordinate!.lng,
    label: labels.join("/") || String(i + 1),
  }));
}
export function miniGuideLines(legs: RouteLeg[]) {
  return legs
    .filter((l) => l.status === "success" && l.result)
    .map((l) => ({
      points: l.result!.points.map(([longitude, latitude]) => ({
        longitude,
        latitude,
      })),
      color: "#28594bDD",
      width: 5,
      arrowLine: true,
    }));
}

// Native request cancellation need not depend on the browser's AbortController.
export class MiniGuideRoutes {
  private sequence = 0;
  private cache = new Map<string, RouteResult>();
  cancel() {
    this.sequence++;
  }
  reset() {
    this.cancel();
    this.cache.clear();
  }
  async generate(
    plan: TripPlan,
    dayId: string,
    fetcher: (
      origin: string,
      destination: string,
      mode: string,
    ) => Promise<RouteResult>,
    update: (legs: RouteLeg[]) => void,
  ) {
    const seq = ++this.sequence,
      legs = routeLegs(plan, dayId);
    update([...legs]);
    for (let i = 0; i < legs.length; i++) {
      if (seq !== this.sequence) return false;
      const leg = legs[i];
      if (leg.status === "manual" || leg.status === "missing") continue;
      const from = plan.places.find((p) => p.id === leg.from.placeId)!,
        to = plan.places.find((p) => p.id === leg.to.placeId)!;
      const origin = coordinateText(from),
        destination = coordinateText(to),
        key = `${origin}:${destination}:${leg.mode}`;
      try {
        const result =
          this.cache.get(key) ?? (await fetcher(origin, destination, leg.mode));
        if (seq !== this.sequence) return false;
        if (this.cache.size >= 200) this.cache.clear();
        this.cache.set(key, result);
        legs[i] = { ...leg, status: "success", result };
      } catch (reason) {
        if (seq !== this.sequence) return false;
        legs[i] = {
          ...leg,
          status: "error",
          message: reason instanceof Error ? reason.message : "路线生成失败",
        };
      }
      update([...legs]);
    }
    return seq === this.sequence;
  }
}
