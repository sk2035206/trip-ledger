import type { AppState, Trip } from "./trip-types";
import { normalizeAppState } from "./trip-utils";

type ApiStateResponse = {
  state?: unknown;
  error?: string;
};

type ApiTripResponse = {
  trip?: unknown;
  error?: string;
};

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function loadRemoteState(): Promise<AppState> {
  const response = await fetch(`${getApiBaseUrl()}/api/state`, {
    headers: getApiHeaders(),
  });
  const payload = (await response.json()) as ApiStateResponse;

  if (!response.ok) {
    throw new ApiClientError(payload.error ?? "读取后端数据失败", response.status);
  }

  return normalizeAppState(payload.state);
}

export async function loadRemoteTrip(tripId: string): Promise<Trip> {
  const response = await fetch(`${getApiBaseUrl()}/api/trips/${encodeURIComponent(tripId)}`, {
    headers: getApiHeaders(),
  });
  const payload = (await response.json()) as ApiTripResponse;

  if (!response.ok) {
    throw new ApiClientError(payload.error ?? "读取出行账单失败", response.status);
  }

  const state = normalizeAppState({ trips: payload.trip ? [payload.trip] : [] });
  const trip = state.trips[0];
  if (!trip) throw new ApiClientError("出行账单不存在", 404);
  return trip;
}

export async function saveRemoteState(state: AppState): Promise<AppState> {
  const response = await fetch(`${getApiBaseUrl()}/api/state`, {
    method: "PUT",
    headers: getApiHeaders(),
    body: JSON.stringify({ state }),
  });
  const payload = (await response.json()) as ApiStateResponse;

  if (!response.ok) {
    throw new ApiClientError(payload.error ?? "保存后端数据失败", response.status);
  }

  return normalizeAppState(payload.state);
}

function getApiBaseUrl() {
  if (typeof window === "undefined") return "";

  const configured = (window as Window & { __TRIP_LEDGER_API_BASE_URL__?: string })
    .__TRIP_LEDGER_API_BASE_URL__;
  if (configured) return configured.replace(/\/$/, "");

  return "";
}

function getApiHeaders() {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}
