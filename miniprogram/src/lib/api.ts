import Taro from "@tarojs/taro";
import { createStateClient, ApiClientError } from "@ledger/state-client";
import { normalizeAppState } from "@ledger/trip-utils";
import { requestErrorMessage } from "@ledger/request-error";
import type { Trip } from "@ledger/trip-types";

export const apiBase = __API_BASE__;
const sessionStorageKey = "trip-ledger-workbench-session-v1";

type MiniSession = {
  token: string;
  expiresAt: number;
};

type LoginResponse = {
  authenticated?: boolean;
  expiresAt?: number;
  sessionDays?: number;
  sessionToken?: string;
  error?: string;
};

async function requestJson<T>(
  path: string,
  method: "GET" | "POST" | "PUT" = "GET",
  data?: unknown,
) {
  try {
    const session = getMiniSession();
    const response = await Taro.request<T>({
      url: `${apiBase}${path}`,
      method,
      data,
      timeout: 20000,
      header: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Trip-Ledger-Client": "miniprogram",
        ...(session ? { "X-Workbench-Session": session.token } : {}),
      },
    });
    if (response.statusCode === 401 && path !== "/api/auth/login") {
      clearMiniSession();
      Taro.eventCenter.trigger("workbench-auth-expired");
    }
    return response;
  } catch (error) {
    console.error("[trip-ledger] API request failed", {
      url: `${apiBase}${path}`,
      error,
    });
    throw new ApiClientError(requestErrorMessage(error, apiBase), 0);
  }
}

export function getMiniSession() {
  const session = Taro.getStorageSync<MiniSession | undefined>(sessionStorageKey);
  if (!session?.token || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) {
    clearMiniSession();
    return null;
  }
  return session;
}

export function hasMiniSession() {
  return Boolean(getMiniSession());
}

export function clearMiniSession() {
  Taro.removeStorageSync(sessionStorageKey);
}

export async function loginMini(password: string) {
  const response = await requestJson<LoginResponse>("/api/auth/login", "POST", { password });
  if (
    response.statusCode !== 200 ||
    !response.data.authenticated ||
    !response.data.sessionToken ||
    !Number.isFinite(response.data.expiresAt)
  ) {
    throw new ApiClientError(response.data.error ?? "密码错误", response.statusCode);
  }
  const session = {
    token: response.data.sessionToken,
    expiresAt: Number(response.data.expiresAt),
  };
  Taro.setStorageSync(sessionStorageKey, session);
  return { sessionDays: Number(response.data.sessionDays ?? 7), expiresAt: session.expiresAt };
}

export const client = createStateClient(async (path, method, data) => {
  const response = await requestJson(path, method, data);
  return { status: response.statusCode, data: response.data };
});
export async function fetchSharedTrip(id: string): Promise<Trip> {
  const response = await requestJson<{ trip?: unknown; error?: string }>(
    `/api/trips/${encodeURIComponent(id)}`,
  );
  if (response.statusCode !== 200 || !response.data.trip) {
    throw new ApiClientError(
      response.data.error ?? "账单不存在或暂时无法访问",
      response.statusCode,
    );
  }
  return normalizeAppState({ trips: [response.data.trip] }).trips[0];
}
export { shareInfo } from "./share";
