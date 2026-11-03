import { useEffect, useMemo, useRef, useState } from "react";
import Taro, {
  useLoad,
  useUnload,
  usePullDownRefresh,
  useShareAppMessage,
} from "@tarojs/taro";
import {
  View,
  Text,
  Button,
  ScrollView,
  Map as NativeMap,
} from "@tarojs/components";
import {
  miniGuidePoints,
  miniGuideLines,
  guideShareInfo,
  validGuideToken,
  MiniGuideRoutes,
  type GuideSnapshot,
} from "@ledger/travel-guide/mini";
import { distanceText, durationText } from "@ledger/travel-guide/plan";
import {
  typeLabels,
  modeLabels,
  type Place,
  type RouteLeg,
} from "@ledger/travel-guide/types";
import { miniGuide } from "../lib/play-plan";
import { appShareInfo } from "../lib/share";
import { Action, Empty } from "./ui";
import "./play-plan-viewer.scss";

export default function GuidePage({ shared = false }: { shared?: boolean }) {
  const params = useRef({ tripId: "", token: "" }),
    loadSequence = useRef(0),
    planner = useRef(new MiniGuideRoutes());
  const cityCache = useRef(
    new Map<string, { center: [number, number]; zoom: number }>(),
  );
  const [snapshot, setSnapshot] = useState<GuideSnapshot | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [token, setToken] = useState(""),
    [shareError, setShareError] = useState(""),
    [sharing, setSharing] = useState(false);
  const [dayIndex, setDayIndex] = useState(0),
    [saved, setSaved] = useState(false),
    [showMap, setShowMap] = useState(false),
    [selected, setSelected] = useState("");
  const [legs, setLegs] = useState<RouteLeg[]>([]),
    [routing, setRouting] = useState(false);
  const [cityView, setCityView] = useState<{
      city: string;
      center: [number, number];
      zoom: number;
    } | null>(null),
    [cityError, setCityError] = useState(""),
    [cityAttempt, setCityAttempt] = useState(0);
  const [mapError, setMapError] = useState(""),
    [mapAttempt, setMapAttempt] = useState(0);
  const plan = snapshot?.plan,
    day = plan?.days[dayIndex] ?? plan?.days[0];
  const points = useMemo(
    () => (plan && day ? miniGuidePoints(plan, day.id, saved) : []),
    [plan, day, saved],
  );
  const markers = useMemo(
    () =>
      points.map((p) => ({
        id: p.id,
        longitude: p.longitude,
        latitude: p.latitude,
        iconPath: `/assets/guide-${p.place.type}.png`,
        width: 28,
        height: 34,
        callout: {
          content: `${p.label} · ${p.place.name}`,
          display: "BYCLICK" as const,
          fontSize: 12,
          padding: 8,
          borderRadius: 6,
          color: "#284737",
          bgColor: "#fffefa",
          anchorX: 0,
          anchorY: 0,
          borderWidth: 1,
          borderColor: "#dce4d5",
          textAlign: "center" as const,
        },
      })),
    [points],
  );
  const lines = useMemo(
    () => (saved ? [] : miniGuideLines(legs)),
    [legs, saved],
  );
  const selectedPoint = points.find((p) => p.place.id === selected),
    center = selectedPoint
      ? [selectedPoint.longitude, selectedPoint.latitude]
      : points.length
        ? [points[0].longitude, points[0].latitude]
        : cityView && cityView.city === day?.defaultSearchCity
          ? cityView.center
          : null;
  const canShare = !!plan && validGuideToken(token) && !loading && !error;
  useShareAppMessage(() =>
    canShare ? guideShareInfo(snapshot!.trip.title, token) : appShareInfo(),
  );
  useEffect(() => {
    const request = canShare
      ? Taro.showShareMenu({ showShareItems: ["shareAppMessage"] })
      : Taro.hideShareMenu({});
    void request.catch(() => undefined);
  }, [canShare]);
  useUnload(() => {
    loadSequence.current++;
    planner.current.cancel();
  });

  async function prepareShare(tripId: string, seq: number) {
    setSharing(true);
    setShareError("");
    try {
      const next = await miniGuide.mint(tripId);
      if (seq === loadSequence.current) setToken(next);
    } catch (reason) {
      if (seq === loadSequence.current) setShareError(message(reason));
    } finally {
      if (seq === loadSequence.current) setSharing(false);
    }
  }
  async function load() {
    const seq = ++loadSequence.current;
    planner.current.reset();
    setLoading(true);
    setError("");
    setSnapshot(null);
    setToken("");
    setShareError("");
    setLegs([]);
    setRouting(false);
    cityCache.current.clear();
    try {
      const result = shared
        ? await miniGuide.shared(params.current.token)
        : await miniGuide.owner(params.current.tripId);
      if (seq !== loadSequence.current) return;
      setSnapshot(result);
      setDayIndex(0);
      setSaved(false);
      setSelected("");
      if (result.plan) {
        if (shared) setToken(params.current.token);
        else void prepareShare(params.current.tripId, seq);
      }
    } catch (reason) {
      if (seq === loadSequence.current) setError(message(reason));
    } finally {
      if (seq === loadSequence.current) setLoading(false);
    }
  }
  useLoad((query) => {
    params.current = { tripId: query.tripId ?? "", token: query.token ?? "" };
    void load();
  });
  usePullDownRefresh(() => {
    void load().finally(() => Taro.stopPullDownRefresh());
  });
  function switchDay(index: number) {
    if (index === dayIndex && !saved) return;
    planner.current.cancel();
    setRouting(false);
    setLegs([]);
    setDayIndex(index);
    setSaved(false);
    setSelected("");
    setCityError("");
    setMapError("");
  }
  function switchSaved(value: boolean) {
    if (value === saved) return;
    planner.current.cancel();
    setRouting(false);
    setLegs([]);
    setSaved(value);
    setSelected("");
  }
  function locate(place: Place) {
    if (!place.coordinate || place.locationStatus !== "confirmed") return;
    setSelected(place.id);
    setShowMap(true);
    Taro.nextTick(() => {
      void Taro.pageScrollTo({
        selector: ".guide-map-panel",
        duration: 200,
      }).catch(() => undefined);
    });
  }
  useEffect(() => {
    if (!showMap || !day || points.length) return;
    let disposed = false;
    const city = day.defaultSearchCity;
    (async () => {
      const view =
        cityCache.current.get(city) ??
        (await miniGuide.city(city, shared ? params.current.token : undefined));
      if (disposed) return;
      cityCache.current.set(city, view);
      setCityView({ city, ...view });
      setCityError("");
    })().catch((reason) => {
      if (!disposed) setCityError(message(reason));
    });
    return () => {
      disposed = true;
    };
  }, [showMap, day, points.length, shared, cityAttempt]);
  useEffect(() => {
    if (!showMap || !points.length || selected) return;
    let disposed = false;
    Taro.nextTick(() => {
      if (!disposed)
        Taro.createMapContext("guide-map").includePoints({
          points: [
            ...points.map((p) => ({
              longitude: p.longitude,
              latitude: p.latitude,
            })),
            ...lines.flatMap((line) => line.points),
          ],
          padding: [45, 30, 45, 30],
          fail: () => undefined,
        });
    });
    return () => {
      disposed = true;
    };
  }, [showMap, points, lines, selected, mapAttempt]);
  async function generate() {
    if (!plan || !day || routing) return;
    setRouting(true);
    const finished = await planner.current.generate(
      plan,
      day.id,
      (origin, destination, mode) =>
        miniGuide.route(
          origin,
          destination,
          mode,
          shared ? params.current.token : undefined,
        ),
      setLegs,
    );
    if (finished) setRouting(false);
  }
  const success = legs.filter((l) => l.status === "success"),
    stayStops = day?.stops.filter((s) => s.durationMinutes !== undefined) ?? [],
    stayMinutes = stayStops.reduce((n, s) => n + (s.durationMinutes ?? 0), 0);
  const roadSeconds = success.reduce((n, l) => n + l.result!.duration, 0),
    roadMeters = success.reduce((n, l) => n + l.result!.distance, 0);
  const places = new Map(plan?.places.map((p) => [p.id, p]));
  return (
    <View className="page mini-guide">
      <View className="guide-title-row">
        <View>
          <Text className="eyebrow">山水之间 · 只读攻略</Text>
          <Text className="page-title">
            {snapshot?.trip.title ?? "游玩攻略"}
          </Text>
        </View>
        {canShare && (
          <Button className="share-control" openType="share">
            {shared ? "转发攻略" : "分享攻略"}
          </Button>
        )}
      </View>
      {loading && <Empty text="正在读取游玩攻略…" />}
      {error && (
        <View className="sync sync-warning">
          <Text>{error}</Text>
          <Action secondary onClick={() => void load()}>
            重新读取
          </Action>
          {!shared && (
            <Action
              secondary
              onClick={() => void Taro.reLaunch({ url: "/pages/home/index" })}
            >
              返回工作台
            </Action>
          )}
        </View>
      )}
      {!loading && !error && snapshot && !plan && (
        <Empty text="这次出行尚未创建游玩攻略，请先在 H5 创建并保存。" />
      )}
      {plan && day && !loading && !error && (
        <>
          <Text className="guide-caption">
            {snapshot?.trip.dates || "日期待确认"} · {plan.days.length} 天
          </Text>
          {sharing && <Text className="guide-caption">正在准备分享卡片…</Text>}
          {shareError && (
            <View className="sync sync-warning">
              <Text>{shareError}</Text>
              <Action
                secondary
                disabled={sharing}
                onClick={() =>
                  void prepareShare(params.current.tripId, loadSequence.current)
                }
              >
                重试分享
              </Action>
            </View>
          )}
          <ScrollView scrollX className="guide-days">
            {plan.days.map((d, i) => (
              <Button
                key={d.id}
                className={`guide-day ${i === dayIndex ? "active" : ""}`}
                onClick={() => switchDay(i)}
              >
                <Text>DAY {String(i + 1).padStart(2, "0")}</Text>
                <Text>{d.title}</Text>
              </Button>
            ))}
          </ScrollView>
          <View className="guide-controls">
            <View className="guide-tabs">
              <Button
                className={`guide-tab ${!saved ? "is-active" : ""}`}
                ariaLabel={`每日行程，${!saved ? "已选中" : "未选中"}`}
                hoverClass="guide-tab-pressed"
                onClick={() => switchSaved(false)}
              >
                <Text className="guide-tab-check">{!saved ? "✓" : ""}</Text>
                <Text>每日行程</Text>
              </Button>
              <Button
                className={`guide-tab ${saved ? "is-active" : ""}`}
                ariaLabel={`待选地点 ${plan.savedPlaceIds.length}，${saved ? "已选中" : "未选中"}`}
                hoverClass="guide-tab-pressed"
                onClick={() => switchSaved(true)}
              >
                <Text className="guide-tab-check">{saved ? "✓" : ""}</Text>
                <Text>待选地点</Text>
                <Text className="guide-tab-count">
                  {plan.savedPlaceIds.length}
                </Text>
              </Button>
            </View>
            <Button
              className={`guide-map-toggle ${showMap ? "is-open" : ""}`}
              onClick={() => setShowMap((v) => !v)}
            >
              {showMap ? "收起地图" : "查看地图"}
            </Button>
          </View>
          {showMap && (
            <View className="guide-map-panel">
              <Text className="guide-section-title">
                {saved ? "待选地点地图" : `${day.defaultSearchCity} · 当日地图`}
              </Text>
              {center ? (
                <NativeMap
                  key={mapAttempt}
                  id="guide-map"
                  className="guide-native-map"
                  longitude={center[0]}
                  latitude={center[1]}
                  scale={
                    selected ? 14 : points.length ? 12 : (cityView?.zoom ?? 10)
                  }
                  markers={markers}
                  polyline={lines}
                  showLocation={false}
                  onError={() =>
                    setMapError("地图暂时无法显示，请重试；下方行程仍可查看。")
                  }
                  onMarkerTap={(event) => {
                    const p = points.find(
                      (p) => p.id === event.detail.markerId,
                    );
                    if (p) setSelected(p.place.id);
                  }}
                />
              ) : (
                <View className="guide-map-empty">
                  <Text>{cityError || "正在定位当天城市…"}</Text>
                  {cityError && (
                    <Action
                      secondary
                      onClick={() => {
                        setCityError("");
                        setCityAttempt((n) => n + 1);
                      }}
                    >
                      重试定位
                    </Action>
                  )}
                </View>
              )}
              {mapError && (
                <View className="sync sync-warning">
                  <Text>{mapError}</Text>
                  <Action
                    secondary
                    onClick={() => {
                      setMapError("");
                      setMapAttempt((n) => n + 1);
                    }}
                  >
                    重试地图
                  </Action>
                </View>
              )}
              <Text className="guide-caption">
                {points.length} 个已确认地点 · 未确认地点不显示标记
              </Text>
              {selectedPoint && (
                <View className="guide-map-detail">
                  <Text>{selectedPoint.place.name}</Text>
                  <Text className="muted">
                    {selectedPoint.place.address || selectedPoint.place.city}
                  </Text>
                  <Button
                    className="guide-link"
                    onClick={() => setSelected("")}
                  >
                    查看全部点位
                  </Button>
                </View>
              )}
            </View>
          )}
          {saved ? (
            <View className="guide-content">
              <Text className="guide-section-title">先收藏，再出发</Text>
              {!plan.savedPlaceIds.length && (
                <Empty text="这份攻略暂时没有待选地点。" />
              )}
              {plan.savedPlaceIds.map((id) => {
                const p = places.get(id)!;
                return (
                  <View className="guide-stop" key={id}>
                    <Text className={`guide-kind ${p.type}`}>
                      {typeLabels[p.type]}
                    </Text>
                    <Text className="guide-stop-title">{p.name}</Text>
                    <Text className="guide-caption">{p.address || p.city}</Text>
                    {p.coordinate ? (
                      <Button className="guide-link" onClick={() => locate(p)}>
                        <Text className="guide-link-icon">↗</Text>
                        <Text>在地图上查看</Text>
                      </Button>
                    ) : (
                      <Text className="guide-caption">
                        分享者尚未确认具体位置
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          ) : (
            <>
              <View className="guide-content">
                <Text className="guide-section-title">{day.title}</Text>
                <Text className="guide-caption">{day.subtitle}</Text>
                <Text className="guide-caption">
                  {day.stops.length} 个安排 · {day.defaultSearchCity}
                </Text>
                {!day.stops.length && <Empty text="这一天暂时没有安排。" />}
                {day.stops.map((stop, i) => {
                  const p = places.get(stop.placeId)!,
                    leg = legs.find((l) => l.to.id === stop.id);
                  return (
                    <View key={stop.id}>
                      {i > 0 && (
                        <View className="guide-transport">
                          <Text>
                            {modeLabels[stop.incomingMode]} ·{" "}
                            {leg?.status === "success"
                              ? `${distanceText(leg.result!.distance)} / ${durationText(leg.result!.duration)}`
                              : leg?.status === "error"
                                ? leg.message
                                : leg?.status === "missing"
                                  ? "相邻地点位置待确认"
                                  : ["subway", "rail", "manual"].includes(
                                        stop.incomingMode,
                                      )
                                    ? "按实际交通安排"
                                    : routing
                                      ? "正在规划…"
                                      : "生成路线后查看距离和用时"}
                          </Text>
                          {stop.manualTransportNote && (
                            <Text>{stop.manualTransportNote}</Text>
                          )}
                        </View>
                      )}
                      <View className="guide-stop">
                        <View className="guide-stop-heading">
                          <Text className="guide-number">
                            {String(i + 1).padStart(2, "0")}
                          </Text>
                          <Text className={`guide-kind ${p.type}`}>
                            {typeLabels[p.type]}
                          </Text>
                        </View>
                        <Text className="guide-stop-title">{p.name}</Text>
                        {stop.note && (
                          <Text className="guide-note">{stop.note}</Text>
                        )}
                        {p.address && (
                          <Text className="guide-caption">{p.address}</Text>
                        )}
                        <Text className="guide-caption">
                          {stop.durationMinutes === undefined
                            ? "停留时间待安排"
                            : `计划停留 ${durationText(stop.durationMinutes * 60)}`}
                        </Text>
                        {p.coordinate ? (
                          <Button
                            className="guide-link"
                            onClick={() => locate(p)}
                          >
                            <Text className="guide-link-icon">↗</Text>
                            <Text>在地图上查看</Text>
                          </Button>
                        ) : (
                          <Text className="guide-caption">
                            位置待分享者确认
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
              <View className="guide-route-summary">
                <Text className="guide-section-title">当日路线</Text>
                <Text>
                  {stayStops.length
                    ? `计划停留 ${durationText(stayMinutes * 60)} · 已设置 ${stayStops.length}/${day.stops.length} 站`
                    : "分享者尚未设置停留时间"}
                </Text>
                {success.length > 0 && (
                  <Text>
                    {distanceText(roadMeters)} · 道路交通{" "}
                    {durationText(roadSeconds)}
                    {stayStops.length
                      ? ` · 已知交通＋停留 ${durationText(roadSeconds + stayMinutes * 60)}`
                      : ""}
                  </Text>
                )}
                {legs.length > 0 && (
                  <Text>
                    已生成 {success.length}/
                    {legs.filter((l) => l.status !== "manual").length}{" "}
                    段道路路线 · 地铁、高铁等手动交通不计入合计
                  </Text>
                )}
                <Button
                  className="guide-primary"
                  disabled={routing || day.stops.length < 2}
                  onClick={() => void generate()}
                >
                  {routing ? "正在规划…" : "生成当日路线"}
                </Button>
              </View>
            </>
          )}
          <Text className="guide-footer">
            此页仅查看。请在 H5
            修改攻略，下拉刷新可读取最新内容。交通、营业时间及预约信息请在出行前核实。
          </Text>
        </>
      )}
    </View>
  );
}
function message(error: unknown) {
  return error instanceof Error ? error.message : "暂时无法读取，请稍后重试";
}
