import type { SearchPlace, RouteResult } from '../domain/types';
export async function request<T>(url: string, signal?: AbortSignal): Promise<T> {
    const response = await fetch(url, { credentials: 'include', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || '请求失败，请稍后重试');
    return body as T;
}
export function createGuideApi(base = '/api', sdkBase = '/_AMapService') {
    return {
        sdkBase,
        getConfig: () => request<{ webKey: string }>(`${base}/config`),
        async searchPlaces(query: string, city: string, signal: AbortSignal) {
            return (await request<{ places: SearchPlace[] }>(`${base}/places?${new URLSearchParams({ q: query, city })}`, signal)).places;
        },
        getRoute: (origin: string, destination: string, mode: string, signal: AbortSignal) => request<RouteResult>(`${base}/route?${new URLSearchParams({ origin, destination, mode })}`, signal),
    };
}
export type GuideApi = ReturnType<typeof createGuideApi>;
export const standaloneApi = createGuideApi();
export const searchPlaces = standaloneApi.searchPlaces;
export const getRoute = standaloneApi.getRoute;
