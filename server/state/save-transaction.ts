import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type { AppState } from "../../frontend/trip-types";
import { assertRevision, stateRevision } from "./revision";

// The compare and write must run inside one cross-process lock and transaction.
export async function saveStateTransaction(
  connection: PoolConnection,
  lockName: string,
  revision: unknown,
  read: (connection: PoolConnection) => Promise<AppState>,
  write: (connection: PoolConnection) => Promise<void>,
) {
  let locked = false;
  try {
    const [rows] = await connection.query<
      (RowDataPacket & { acquired: number })[]
    >("SELECT GET_LOCK(?, 10) AS acquired", [lockName]);
    locked = rows[0]?.acquired === 1;
    if (!locked)
      throw Object.assign(new Error("其他设备正在保存，请稍后重试"), {
        status: 503,
      });
    await connection.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await connection.beginTransaction();
    assertRevision(await read(connection), revision);
    await write(connection);
    const state = await read(connection);
    await connection.commit();
    return { state, revision: stateRevision(state) };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    try {
      if (locked) await connection.query("SELECT RELEASE_LOCK(?)", [lockName]);
    } finally {
      connection.release();
    }
  }
}
