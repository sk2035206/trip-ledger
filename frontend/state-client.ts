import type { AppState } from "./trip-types";
import { normalizeAppState } from "./trip-utils";

export type StateSnapshot = { state: AppState; revision: string };
export type ApiTransport = (path: string, method: "GET" | "PUT", body?: unknown) => Promise<{ status: number; data: unknown }>;
export class ApiClientError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

// Each editor owns its revision. Never refresh a revision behind unsaved local edits.
export function createStateClient(transport: ApiTransport) {
  let revision: string | null = null;
  let conflict = false;
  let writing = false;
  return {
    async load(): Promise<StateSnapshot> {
      const result = await transport("/api/state", "GET");
      const payload = result.data as Partial<StateSnapshot> & { error?: string };
      if (result.status !== 200) throw new ApiClientError(payload?.error ?? "读取账单失败", result.status);
      if (!payload?.state || !Array.isArray(payload.state.trips) || typeof payload.revision !== "string") {
        throw new ApiClientError("后端版本不匹配，请先更新后端", 502);
      }
      revision = payload.revision;
      conflict = false;
      return { state: normalizeAppState(payload.state), revision };
    },
    async save(state: AppState): Promise<AppState> {
      if (conflict) throw new ApiClientError("账单已被其他设备修改，请刷新后重新操作", 409);
      if (!revision) throw new ApiClientError("请先成功读取远程账单", 428);
      if (writing) throw new ApiClientError("正在保存，请稍候", 429);
      writing = true;
      try {
        const result = await transport("/api/state", "PUT", { state, revision });
        const payload = result.data as Partial<StateSnapshot> & { error?: string };
        if (result.status === 409) conflict = true;
        if (result.status !== 200) throw new ApiClientError(payload?.error ?? "保存失败，请重试", result.status);
        if (typeof payload?.revision !== "string" || !payload.state || !Array.isArray(payload.state.trips)) {
          throw new ApiClientError("保存响应异常，请刷新确认数据", 502);
        }
        revision = payload.revision;
        return normalizeAppState(payload.state);
      } finally { writing = false; }
    },
  };
}
