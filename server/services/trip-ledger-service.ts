import { getMysqlConfig } from "../mysql/config";
import { ensureSchema, getBusinessTableStats, readAppState, writeAppState } from "../mysql/trip-ledger-repository";

export async function getStorageHealth() {
  await ensureSchema();
  const config = getMysqlConfig();
  const tables = await getBusinessTableStats();

  return {
    ok: true,
    storage: "mysql-relational",
    database: config.database,
    host: config.host,
    port: config.port,
    tables,
  };
}

export async function getLedgerState() {
  return readAppState();
}

export async function saveLedgerState(state: unknown) {
  return writeAppState(state);
}
