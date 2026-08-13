import mysql from "mysql2/promise";
import { getMysqlConfig } from "./config";

let pool: mysql.Pool | null = null;

export function getMysqlPool() {
  if (pool) return pool;

  const config = getMysqlConfig();
  pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: config.connectionLimit,
    charset: "utf8mb4",
  });

  return pool;
}
