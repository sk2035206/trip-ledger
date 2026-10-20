import { getMysqlConfig } from "../mysql/config";
import { ensureSchema, getBusinessTableStats, readAppState, readStateSnapshot, writeAppState } from "../mysql/trip-ledger-repository";

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
  return readStateSnapshot();
}

export async function getLedgerTrip(tripId: string) {
  const state = await readAppState();
  return state.trips.find((trip) => trip.id === tripId) ?? null;
}

export async function saveLedgerState(state: unknown, revision: unknown) {
  return writeAppState(state, revision);
}
