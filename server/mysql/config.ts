import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type MysqlConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionLimit: number;
};

const defaultConfigPath = resolve(process.cwd(), "config/mysql.json");

export function getMysqlConfig(): MysqlConfig {
  const fileConfig = readMysqlConfigFile(process.env.MYSQL_CONFIG_PATH ?? defaultConfigPath);

  return {
    host: process.env.MYSQL_HOST ?? fileConfig.host,
    port: Number(process.env.MYSQL_PORT ?? fileConfig.port),
    user: process.env.MYSQL_USER ?? fileConfig.user,
    password: process.env.MYSQL_PASSWORD ?? fileConfig.password,
    database: process.env.MYSQL_DATABASE ?? fileConfig.database,
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT ?? fileConfig.connectionLimit ?? 10),
  };
}

function readMysqlConfigFile(path: string): MysqlConfig {
  try {
    const content = readFileSync(path, "utf8");
    const parsed = JSON.parse(content) as Partial<MysqlConfig>;
    return {
      host: requireString(parsed.host, "host"),
      port: requireNumber(parsed.port, "port"),
      user: requireString(parsed.user, "user"),
      password: requireString(parsed.password, "password"),
      database: requireString(parsed.database, "database"),
      connectionLimit: typeof parsed.connectionLimit === "number" ? parsed.connectionLimit : 10,
    };
  } catch (error) {
    if (error instanceof SyntaxError) throw error;
    return {
      host: "127.0.0.1",
      port: 3306,
      user: "root",
      password: "",
      database: "trip_ledger",
      connectionLimit: 10,
    };
  }
}

function requireString(value: unknown, key: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`MySQL config field "${key}" is required.`);
  }
  return value;
}

function requireNumber(value: unknown, key: string) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`MySQL config field "${key}" must be a number.`);
  }
  return numberValue;
}
