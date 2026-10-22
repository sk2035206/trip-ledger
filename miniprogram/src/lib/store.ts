import { useSyncExternalStore } from "react";
import Taro from "@tarojs/taro";
import { ApiClientError } from "@ledger/state-client";
import type { AppState, Trip } from "@ledger/trip-types";
import { client } from "./api";

type Store = {
  state: AppState | null;
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  error: string;
  conflict: boolean;
  authRequired: boolean;
};
let snapshot: Store = {
  state: null,
  loading: false,
  saving: false,
  dirty: false,
  error: "",
  conflict: false,
  authRequired: false,
};
const listeners = new Set<() => void>();
function publish(patch: Partial<Store>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
}

export function resetLedger(authRequired = false) {
  publish({
    state: null,
    loading: false,
    saving: false,
    dirty: false,
    error: "",
    conflict: false,
    authRequired,
  });
}

export function requireLedgerLogin() {
  resetLedger(true);
}

Taro.eventCenter.on("workbench-auth-expired", requireLedgerLogin);
export function useLedger() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => snapshot,
  );
}
export async function loadLedger(discard = false) {
  if (snapshot.loading || snapshot.saving) return;
  if (snapshot.dirty && !discard) return;
  publish({ loading: true, error: "" });
  try {
    const result = await client.load();
    publish({ state: result.state, dirty: false, conflict: false, authRequired: false });
  } catch (error) {
    const authRequired = error instanceof ApiClientError && error.status === 401;
    publish({
      error: authRequired
        ? ""
        : error instanceof Error
          ? error.message
          : "连接失败，请检查网络后重试",
      authRequired,
    });
  } finally {
    publish({ loading: false });
  }
}
export async function refreshLedger() {
  if (snapshot.dirty) {
    const result = await Taro.showModal({
      title: "读取最新账单？",
      content: "本地未保存的修改将被放弃。可以先复制草稿留存。",
      confirmText: "放弃并刷新",
    });
    if (!result.confirm) return;
  }
  await loadLedger(true);
}
export async function saveChange(update: (state: AppState) => AppState) {
  if (!snapshot.state || snapshot.loading || snapshot.saving || snapshot.dirty)
    return false;
  publish({ state: update(snapshot.state), dirty: true });
  return retrySave();
}
export async function retrySave() {
  if (
    !snapshot.state ||
    snapshot.conflict ||
    snapshot.saving ||
    snapshot.loading
  )
    return false;
  publish({ saving: true, error: "" });
  try {
    const state = await client.save(snapshot.state);
    publish({ state, dirty: false });
    return true;
  } catch (error) {
    publish({
      error:
        error instanceof Error ? error.message : "保存失败，请检查网络后重试",
      conflict: error instanceof ApiClientError && error.status === 409,
    });
    return false;
  } finally {
    publish({ saving: false });
  }
}
export function updateTrip(tripId: string, update: (trip: Trip) => Trip) {
  return saveChange((state) => ({
    ...state,
    trips: state.trips.map((trip) =>
      trip.id === tripId ? update(trip) : trip,
    ),
  }));
}
export function copyDraft() {
  if (snapshot.state)
    void Taro.setClipboardData({
      data: JSON.stringify(snapshot.state, null, 2),
    });
}
export async function confirmAction(content: string) {
  return (
    await Taro.showModal({ title: "请确认", content, confirmColor: "#174c43" })
  ).confirm;
}
export function notify(title: string) {
  void Taro.showToast({ title, icon: "none" });
}
