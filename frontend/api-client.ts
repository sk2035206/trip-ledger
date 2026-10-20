import type { AppState, Trip } from "./trip-types";
import { normalizeAppState } from "./trip-utils";
import { ApiClientError, createStateClient } from "./state-client";
export { ApiClientError } from "./state-client";

const client = createStateClient(async (path, method, body) => {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method,
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
});

export async function loadRemoteState(): Promise<AppState> {
  return (await client.load()).state;
}

export async function loadRemoteTrip(tripId: string): Promise<Trip> {
  const response = await fetch(`${getApiBaseUrl()}/api/trips/${encodeURIComponent(tripId)}`, {
    headers: { Accept: "application/json" },
  });
  const payload = await response.json() as { trip?: unknown; error?: string };
  if (!response.ok) throw new ApiClientError(payload.error ?? "读取出行账单失败", response.status);
  if (!payload.trip) throw new ApiClientError("出行账单不存在", 404);
  const trip = normalizeAppState({ trips: [payload.trip] }).trips[0];
  if (!trip) throw new ApiClientError("出行账单不存在", 404);
  return trip;
}

let saveError: Error | null = null;
const listeners = new Set<(error: Error | null) => void>();
export function subscribeSaveError(listener: (error: Error | null) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export async function saveRemoteState(state: AppState): Promise<AppState> {
  try {
    const result = await client.save(state);
    saveError = null;
    listeners.forEach((listener) => listener(null));
    return result;
  } catch (error) {
    saveError = error instanceof Error ? error : new Error("保存失败，请重试");
    listeners.forEach((listener) => listener(saveError));
    throw error;
  }
}
function getApiBaseUrl() {
  if (typeof window === "undefined") return "";
  return ((window as Window & { __TRIP_LEDGER_API_BASE_URL__?: string }).__TRIP_LEDGER_API_BASE_URL__ ?? "").replace(/\/$/, "");
}
