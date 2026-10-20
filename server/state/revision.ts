import { createHash } from "node:crypto";
import type { AppState } from "../../frontend/trip-types";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
export function stateRevision(state: AppState) {
  return createHash("sha256").update(canonical(state)).digest("hex");
}
export class StateConflictError extends Error {
  readonly status = 409;
  constructor() { super("账单已被其他设备修改，请刷新后重新操作；本次修改未保存"); }
}
export class StatePreconditionError extends Error {
  readonly status = 428;
  constructor() { super("缺少账单版本，请刷新页面或更新客户端"); }
}
export function assertRevision(state: AppState, revision: unknown) {
  if (typeof revision !== "string" || !revision) throw new StatePreconditionError();
  if (stateRevision(state) !== revision) throw new StateConflictError();
}
