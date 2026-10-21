import { useRef, useState } from "react";
import Taro, {
  useLoad,
  usePullDownRefresh,
  useShareAppMessage,
} from "@tarojs/taro";
import { View, Text, Button } from "@tarojs/components";
import type { Trip } from "@ledger/trip-types";
import LedgerView from "../../components/ledger-view";
import { Action, Empty } from "../../components/ui";
import { Icon } from "../../components/visual";
import { fetchSharedTrip, shareInfo } from "../../lib/api";

export default function SharePage() {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const tripId = useRef("");
  const sequence = useRef(0);
  async function load() {
    if (!tripId.current) {
      setError("分享链接缺少账单编号");
      return;
    }
    const seq = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const result = await fetchSharedTrip(tripId.current);
      if (seq === sequence.current) setTrip(result);
    } catch (e) {
      if (seq === sequence.current)
        setError(e instanceof Error ? e.message : "读取失败，请稍后重试");
    } finally {
      if (seq === sequence.current) setLoading(false);
    }
  }
  useLoad((params) => {
    tripId.current = params.tripId ?? "";
    void load();
  });
  usePullDownRefresh(() => {
    void load().finally(() => Taro.stopPullDownRefresh());
  });
  useShareAppMessage(() =>
    trip
      ? shareInfo(trip)
      : {
          title: "旅行分账清单",
          path: `/pages/share/index?tripId=${encodeURIComponent(tripId.current)}`,
        },
  );
  return (
    <View className="page">
      <View className="trip-heading">
        <View className="trip-topline">
          <View className="journey-tag">
            <Icon name="trip" />
            <Text>只读分享</Text>
          </View>
          {trip && (
            <Button className="share-control" openType="share">
              <Icon name="share" />
              <Text>转发账单</Text>
            </Button>
          )}
        </View>
        <Text className="trip-title">{trip?.title ?? "旅行分账清单"}</Text>
        <Text className="page-caption">
          {trip?.dates || "记录旅途的每一笔"} · 仅查看，不可编辑
        </Text>
      </View>
      {loading && <Empty text="正在读取账单…" />}
      {error && (
        <View className="sync sync-warning">
          <Text>{error}</Text>
          <Action secondary onClick={() => void load()}>
            重试
          </Action>
        </View>
      )}
      {trip && <LedgerView key={trip.id} trip={trip} />}
    </View>
  );
}
