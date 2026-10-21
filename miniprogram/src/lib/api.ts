import Taro from "@tarojs/taro";
import { createStateClient, ApiClientError } from "@ledger/state-client";
import { normalizeAppState } from "@ledger/trip-utils";
import { requestErrorMessage } from "@ledger/request-error";
import type { Trip } from "@ledger/trip-types";

export const apiBase = __API_BASE__;
async function requestJson<T>(
  path: string,
  method: "GET" | "PUT" = "GET",
  data?: unknown,
) {
  try {
    return await Taro.request<T>({
      url: `${apiBase}${path}`,
      method,
      data,
      timeout: 20000,
      header: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("[trip-ledger] API request failed", {
      url: `${apiBase}${path}`,
      error,
    });
    throw new ApiClientError(requestErrorMessage(error, apiBase), 0);
  }
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
export function shareInfo(trip: Trip) {
  return {
    title: `${trip.title} · 分账清单`,
    path: `/pages/share/index?tripId=${encodeURIComponent(trip.id)}`,
    imageUrl: "/assets/share-card.png",
  };
}
