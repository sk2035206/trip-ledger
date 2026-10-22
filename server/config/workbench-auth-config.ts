import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type WorkbenchAuthSettings = {
  password: string;
  sessionDays: number;
  cookieName: string;
  sessionSecret: string;
};

type WorkbenchAuthFile = {
  password?: unknown;
  sessionDays?: unknown;
};

const defaultConfigPath = resolve(process.cwd(), "config/workbench-auth.json");

export class WorkbenchAuthConfig {
  static readonly cookieName = "trip-ledger-workbench-session";

  static load(path = defaultConfigPath): WorkbenchAuthSettings {
    const fileConfig = readConfigFile(path);
    const password = requireString(fileConfig.password, "password");
    const sessionDays = requirePositiveNumber(fileConfig.sessionDays, "sessionDays");

    return {
      password,
      sessionDays,
      cookieName: this.cookieName,
      sessionSecret: `trip-ledger:${password}`,
    };
  }
}

function readConfigFile(path: string): WorkbenchAuthFile {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as WorkbenchAuthFile;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error(`Workbench auth config file not found: ${path}`);
    }
    throw error;
  }
}

function requireString(value: unknown, key: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Workbench auth config field "${key}" is required.`);
  }
  return value;
}

function requirePositiveNumber(value: unknown, key: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Workbench auth config field "${key}" must be a positive number.`);
  }
  return parsed;
}
