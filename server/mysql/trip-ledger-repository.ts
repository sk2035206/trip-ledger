import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { defaultState } from "../../frontend/sample-data";
import type { AppState, Person, Trip } from "../../frontend/trip-types";
import { normalizeAppState } from "../../frontend/trip-utils";
import { getMysqlPool } from "./pool";

const STATE_ID = "default";
const MIGRATION_LOCK_NAME = "trip_ledger_state_migration";

export const businessTables = [
  "people",
  "categories",
  "trips",
  "trip_members",
  "shared_expenses",
  "shared_expense_participants",
  "travel_costs",
  "travel_cost_participants",
  "personal_expenses",
  "adjustments",
] as const;

type BusinessTable = (typeof businessTables)[number];

export type TableStat = {
  table: BusinessTable;
  rows: number;
};

type Queryable = Pool | PoolConnection;
type QueryValues = string | number | bigint | boolean | Date | null | undefined | (string | number | null | undefined)[] | unknown[][];

type CountRow = RowDataPacket & {
  count: number | string;
};

type LegacyStateRow = RowDataPacket & {
  payload: string | AppState;
};

type LockRow = RowDataPacket & {
  acquired: number | string | null;
};

type PersonRow = RowDataPacket & {
  id: string;
  name: string;
  note: string | null;
};

type CategoryRow = RowDataPacket & {
  name: string;
};

type TripRow = RowDataPacket & {
  id: string;
  title: string;
  dates: string | null;
};

type TripMemberRow = RowDataPacket & {
  trip_id: string;
  id: string;
  name: string;
  note: string | null;
};

type SharedExpenseRow = RowDataPacket & {
  id: string;
  trip_id: string;
  title: string;
  category_name: string;
  amount: number | string;
  note: string | null;
};

type TravelCostRow = RowDataPacket & {
  id: string;
  trip_id: string;
  title: string;
  amount: number | string;
  note: string | null;
};

type PersonalExpenseRow = RowDataPacket & {
  id: string;
  trip_id: string;
  person_id: string;
  title: string;
  amount: number | string;
  expense_date: string | null;
  note: string | null;
};

type AdjustmentRow = RowDataPacket & {
  id: string;
  trip_id: string;
  person_id: string;
  title: string;
  amount: number | string;
  note: string | null;
};

type ParticipantRow = RowDataPacket & {
  record_id: string;
  person_id: string;
};

let schemaPromise: Promise<void> | null = null;

const schemaStatements = [
  `
    CREATE TABLE IF NOT EXISTS trip_ledger_state (
      id VARCHAR(32) NOT NULL PRIMARY KEY COMMENT '状态快照ID，固定为default',
      payload JSON NOT NULL COMMENT '旧版本整包账本JSON，仅用于迁移到业务分表',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='历史账本状态快照表，仅作为旧数据迁移来源'
  `,
  `
    CREATE TABLE IF NOT EXISTS people (
      id VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '人员ID',
      name VARCHAR(120) NOT NULL COMMENT '人员姓名',
      note VARCHAR(255) NULL COMMENT '人员备注',
      sort_order INT NOT NULL DEFAULT 0 COMMENT '排序值',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      UNIQUE KEY uk_people_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='全局人员库'
  `,
  `
    CREATE TABLE IF NOT EXISTS categories (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '类别ID',
      name VARCHAR(100) NOT NULL COMMENT '公共费用类别名称',
      sort_order INT NOT NULL DEFAULT 0 COMMENT '排序值',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      UNIQUE KEY uk_categories_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='公共费用类别表'
  `,
  `
    CREATE TABLE IF NOT EXISTS trips (
      id VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '出行账本ID',
      title VARCHAR(200) NOT NULL COMMENT '出行账本名称',
      dates VARCHAR(100) NULL COMMENT '出行日期或日期范围',
      sort_order INT NOT NULL DEFAULT 0 COMMENT '排序值',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='出行账本主表'
  `,
  `
    CREATE TABLE IF NOT EXISTS trip_members (
      trip_id VARCHAR(64) NOT NULL COMMENT '出行账本ID',
      person_id VARCHAR(64) NOT NULL COMMENT '人员ID',
      sort_order INT NOT NULL DEFAULT 0 COMMENT '本次出行成员排序值',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      PRIMARY KEY (trip_id, person_id),
      KEY idx_trip_members_person (person_id),
      CONSTRAINT fk_trip_members_trip FOREIGN KEY (trip_id) REFERENCES trips (id) ON DELETE CASCADE,
      CONSTRAINT fk_trip_members_person FOREIGN KEY (person_id) REFERENCES people (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='出行账本成员关联表'
  `,
  `
    CREATE TABLE IF NOT EXISTS shared_expenses (
      id VARCHAR(96) NOT NULL PRIMARY KEY COMMENT '公共费用ID',
      trip_id VARCHAR(64) NOT NULL COMMENT '出行账本ID',
      title VARCHAR(200) NOT NULL COMMENT '费用事项名称',
      category_name VARCHAR(100) NOT NULL COMMENT '公共费用类别名称',
      amount DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '费用金额',
      note TEXT NULL COMMENT '备注',
      sort_order INT NOT NULL DEFAULT 0 COMMENT '排序值',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      KEY idx_shared_expenses_trip (trip_id),
      KEY idx_shared_expenses_category (category_name),
      CONSTRAINT fk_shared_expenses_trip FOREIGN KEY (trip_id) REFERENCES trips (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='公共费用明细表'
  `,
  `
    CREATE TABLE IF NOT EXISTS shared_expense_participants (
      expense_id VARCHAR(96) NOT NULL COMMENT '公共费用ID',
      person_id VARCHAR(64) NOT NULL COMMENT '参与分摊人员ID',
      sort_order INT NOT NULL DEFAULT 0 COMMENT '排序值',
      PRIMARY KEY (expense_id, person_id),
      KEY idx_shared_expense_participants_person (person_id),
      CONSTRAINT fk_shared_expense_participants_expense FOREIGN KEY (expense_id) REFERENCES shared_expenses (id) ON DELETE CASCADE,
      CONSTRAINT fk_shared_expense_participants_person FOREIGN KEY (person_id) REFERENCES people (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='公共费用参与分摊人员表'
  `,
  `
    CREATE TABLE IF NOT EXISTS travel_costs (
      id VARCHAR(96) NOT NULL PRIMARY KEY COMMENT '出行费用ID',
      trip_id VARCHAR(64) NOT NULL COMMENT '出行账本ID',
      title VARCHAR(200) NOT NULL COMMENT '行程或交通事项名称',
      amount DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '费用金额',
      note TEXT NULL COMMENT '备注或计算公式',
      sort_order INT NOT NULL DEFAULT 0 COMMENT '排序值',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      KEY idx_travel_costs_trip (trip_id),
      CONSTRAINT fk_travel_costs_trip FOREIGN KEY (trip_id) REFERENCES trips (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='出行费用明细表'
  `,
  `
    CREATE TABLE IF NOT EXISTS travel_cost_participants (
      travel_cost_id VARCHAR(96) NOT NULL COMMENT '出行费用ID',
      person_id VARCHAR(64) NOT NULL COMMENT '参与分摊人员ID',
      sort_order INT NOT NULL DEFAULT 0 COMMENT '排序值',
      PRIMARY KEY (travel_cost_id, person_id),
      KEY idx_travel_cost_participants_person (person_id),
      CONSTRAINT fk_travel_cost_participants_cost FOREIGN KEY (travel_cost_id) REFERENCES travel_costs (id) ON DELETE CASCADE,
      CONSTRAINT fk_travel_cost_participants_person FOREIGN KEY (person_id) REFERENCES people (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='出行费用参与分摊人员表'
  `,
  `
    CREATE TABLE IF NOT EXISTS personal_expenses (
      id VARCHAR(96) NOT NULL PRIMARY KEY COMMENT '个人费用ID',
      trip_id VARCHAR(64) NOT NULL COMMENT '出行账本ID',
      person_id VARCHAR(64) NOT NULL COMMENT '所属人员ID',
      title VARCHAR(200) NOT NULL COMMENT '个人费用事项名称',
      amount DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '个人费用金额',
      expense_date VARCHAR(32) NULL COMMENT '费用日期',
      note TEXT NULL COMMENT '备注或计算公式',
      sort_order INT NOT NULL DEFAULT 0 COMMENT '排序值',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      KEY idx_personal_expenses_trip (trip_id),
      KEY idx_personal_expenses_person (person_id),
      CONSTRAINT fk_personal_expenses_trip FOREIGN KEY (trip_id) REFERENCES trips (id) ON DELETE CASCADE,
      CONSTRAINT fk_personal_expenses_person FOREIGN KEY (person_id) REFERENCES people (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='个人费用明细表'
  `,
  `
    CREATE TABLE IF NOT EXISTS adjustments (
      id VARCHAR(96) NOT NULL PRIMARY KEY COMMENT '自付记录ID',
      trip_id VARCHAR(64) NOT NULL COMMENT '出行账本ID',
      person_id VARCHAR(64) NOT NULL COMMENT '自付人员ID',
      title VARCHAR(200) NOT NULL COMMENT '自付事项名称',
      amount DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '自付扣减金额，通常为负数',
      note TEXT NULL COMMENT '备注',
      sort_order INT NOT NULL DEFAULT 0 COMMENT '排序值',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      KEY idx_adjustments_trip (trip_id),
      KEY idx_adjustments_person (person_id),
      CONSTRAINT fk_adjustments_trip FOREIGN KEY (trip_id) REFERENCES trips (id) ON DELETE CASCADE,
      CONSTRAINT fk_adjustments_person FOREIGN KEY (person_id) REFERENCES people (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='成员自付扣减记录表'
  `,
];

const schemaCommentStatements = [
  "ALTER TABLE trip_ledger_state COMMENT = '历史账本状态快照表，仅作为旧数据迁移来源'",
  "ALTER TABLE trip_ledger_state MODIFY id VARCHAR(32) NOT NULL COMMENT '状态快照ID，固定为default'",
  "ALTER TABLE trip_ledger_state MODIFY payload JSON NOT NULL COMMENT '旧版本整包账本JSON，仅用于迁移到业务分表'",
  "ALTER TABLE trip_ledger_state MODIFY created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'",
  "ALTER TABLE trip_ledger_state MODIFY updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'",
  "ALTER TABLE people COMMENT = '全局人员库'",
  "ALTER TABLE people MODIFY id VARCHAR(64) NOT NULL COMMENT '人员ID'",
  "ALTER TABLE people MODIFY name VARCHAR(120) NOT NULL COMMENT '人员姓名'",
  "ALTER TABLE people MODIFY note VARCHAR(255) NULL COMMENT '人员备注'",
  "ALTER TABLE people MODIFY sort_order INT NOT NULL DEFAULT 0 COMMENT '排序值'",
  "ALTER TABLE people MODIFY created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'",
  "ALTER TABLE people MODIFY updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'",
  "ALTER TABLE categories COMMENT = '公共费用类别表'",
  "ALTER TABLE categories MODIFY id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '类别ID'",
  "ALTER TABLE categories MODIFY name VARCHAR(100) NOT NULL COMMENT '公共费用类别名称'",
  "ALTER TABLE categories MODIFY sort_order INT NOT NULL DEFAULT 0 COMMENT '排序值'",
  "ALTER TABLE categories MODIFY created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'",
  "ALTER TABLE categories MODIFY updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'",
  "ALTER TABLE trips COMMENT = '出行账本主表'",
  "ALTER TABLE trips MODIFY id VARCHAR(64) NOT NULL COMMENT '出行账本ID'",
  "ALTER TABLE trips MODIFY title VARCHAR(200) NOT NULL COMMENT '出行账本名称'",
  "ALTER TABLE trips MODIFY dates VARCHAR(100) NULL COMMENT '出行日期或日期范围'",
  "ALTER TABLE trips MODIFY sort_order INT NOT NULL DEFAULT 0 COMMENT '排序值'",
  "ALTER TABLE trips MODIFY created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'",
  "ALTER TABLE trips MODIFY updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'",
  "ALTER TABLE trip_members COMMENT = '出行账本成员关联表'",
  "ALTER TABLE trip_members MODIFY trip_id VARCHAR(64) NOT NULL COMMENT '出行账本ID'",
  "ALTER TABLE trip_members MODIFY person_id VARCHAR(64) NOT NULL COMMENT '人员ID'",
  "ALTER TABLE trip_members MODIFY sort_order INT NOT NULL DEFAULT 0 COMMENT '本次出行成员排序值'",
  "ALTER TABLE trip_members MODIFY created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'",
  "ALTER TABLE shared_expenses COMMENT = '公共费用明细表'",
  "ALTER TABLE shared_expenses MODIFY id VARCHAR(96) NOT NULL COMMENT '公共费用ID'",
  "ALTER TABLE shared_expenses MODIFY trip_id VARCHAR(64) NOT NULL COMMENT '出行账本ID'",
  "ALTER TABLE shared_expenses MODIFY title VARCHAR(200) NOT NULL COMMENT '费用事项名称'",
  "ALTER TABLE shared_expenses MODIFY category_name VARCHAR(100) NOT NULL COMMENT '公共费用类别名称'",
  "ALTER TABLE shared_expenses MODIFY amount DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '费用金额'",
  "ALTER TABLE shared_expenses MODIFY note TEXT NULL COMMENT '备注'",
  "ALTER TABLE shared_expenses MODIFY sort_order INT NOT NULL DEFAULT 0 COMMENT '排序值'",
  "ALTER TABLE shared_expenses MODIFY created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'",
  "ALTER TABLE shared_expenses MODIFY updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'",
  "ALTER TABLE shared_expense_participants COMMENT = '公共费用参与分摊人员表'",
  "ALTER TABLE shared_expense_participants MODIFY expense_id VARCHAR(96) NOT NULL COMMENT '公共费用ID'",
  "ALTER TABLE shared_expense_participants MODIFY person_id VARCHAR(64) NOT NULL COMMENT '参与分摊人员ID'",
  "ALTER TABLE shared_expense_participants MODIFY sort_order INT NOT NULL DEFAULT 0 COMMENT '排序值'",
  "ALTER TABLE travel_costs COMMENT = '出行费用明细表'",
  "ALTER TABLE travel_costs MODIFY id VARCHAR(96) NOT NULL COMMENT '出行费用ID'",
  "ALTER TABLE travel_costs MODIFY trip_id VARCHAR(64) NOT NULL COMMENT '出行账本ID'",
  "ALTER TABLE travel_costs MODIFY title VARCHAR(200) NOT NULL COMMENT '行程或交通事项名称'",
  "ALTER TABLE travel_costs MODIFY amount DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '费用金额'",
  "ALTER TABLE travel_costs MODIFY note TEXT NULL COMMENT '备注或计算公式'",
  "ALTER TABLE travel_costs MODIFY sort_order INT NOT NULL DEFAULT 0 COMMENT '排序值'",
  "ALTER TABLE travel_costs MODIFY created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'",
  "ALTER TABLE travel_costs MODIFY updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'",
  "ALTER TABLE travel_cost_participants COMMENT = '出行费用参与分摊人员表'",
  "ALTER TABLE travel_cost_participants MODIFY travel_cost_id VARCHAR(96) NOT NULL COMMENT '出行费用ID'",
  "ALTER TABLE travel_cost_participants MODIFY person_id VARCHAR(64) NOT NULL COMMENT '参与分摊人员ID'",
  "ALTER TABLE travel_cost_participants MODIFY sort_order INT NOT NULL DEFAULT 0 COMMENT '排序值'",
  "ALTER TABLE personal_expenses COMMENT = '个人费用明细表'",
  "ALTER TABLE personal_expenses MODIFY id VARCHAR(96) NOT NULL COMMENT '个人费用ID'",
  "ALTER TABLE personal_expenses MODIFY trip_id VARCHAR(64) NOT NULL COMMENT '出行账本ID'",
  "ALTER TABLE personal_expenses MODIFY person_id VARCHAR(64) NOT NULL COMMENT '所属人员ID'",
  "ALTER TABLE personal_expenses MODIFY title VARCHAR(200) NOT NULL COMMENT '个人费用事项名称'",
  "ALTER TABLE personal_expenses MODIFY amount DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '个人费用金额'",
  "ALTER TABLE personal_expenses MODIFY expense_date VARCHAR(32) NULL COMMENT '费用日期'",
  "ALTER TABLE personal_expenses MODIFY note TEXT NULL COMMENT '备注或计算公式'",
  "ALTER TABLE personal_expenses MODIFY sort_order INT NOT NULL DEFAULT 0 COMMENT '排序值'",
  "ALTER TABLE personal_expenses MODIFY created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'",
  "ALTER TABLE personal_expenses MODIFY updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'",
  "ALTER TABLE adjustments COMMENT = '成员自付扣减记录表'",
  "ALTER TABLE adjustments MODIFY id VARCHAR(96) NOT NULL COMMENT '自付记录ID'",
  "ALTER TABLE adjustments MODIFY trip_id VARCHAR(64) NOT NULL COMMENT '出行账本ID'",
  "ALTER TABLE adjustments MODIFY person_id VARCHAR(64) NOT NULL COMMENT '自付人员ID'",
  "ALTER TABLE adjustments MODIFY title VARCHAR(200) NOT NULL COMMENT '自付事项名称'",
  "ALTER TABLE adjustments MODIFY amount DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '自付扣减金额，通常为负数'",
  "ALTER TABLE adjustments MODIFY note TEXT NULL COMMENT '备注'",
  "ALTER TABLE adjustments MODIFY sort_order INT NOT NULL DEFAULT 0 COMMENT '排序值'",
  "ALTER TABLE adjustments MODIFY created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'",
  "ALTER TABLE adjustments MODIFY updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'",
];

export async function ensureSchema() {
  schemaPromise ??= initializeSchema().catch((error: unknown) => {
    schemaPromise = null;
    throw error;
  });

  return schemaPromise;
}

async function initializeSchema() {
  const db = getMysqlPool();
  for (const statement of schemaStatements) {
    await db.execute(statement);
  }
  for (const statement of schemaCommentStatements) {
    await db.execute(statement);
  }
}

export async function getBusinessTableStats(): Promise<TableStat[]> {
  await ensureSchema();
  await importLegacyStateIfNeeded();
  return countBusinessRows(getMysqlPool());
}

export async function readAppState(): Promise<AppState> {
  await ensureSchema();
  await importLegacyStateIfNeeded();
  return readStateFromTables(getMysqlPool());
}

export async function writeAppState(state: unknown): Promise<AppState> {
  await ensureSchema();
  return replaceState(normalizeAppState(state));
}

async function importLegacyStateIfNeeded() {
  const db = getMysqlPool();
  const hasBusinessRows = (await countBusinessRows(db)).some((stat) => stat.rows > 0);
  if (hasBusinessRows) return;

  const connection = await db.getConnection();
  let lockAcquired = false;

  try {
    const lockRows = await queryRows<LockRow>(connection, "SELECT GET_LOCK(?, 10) AS acquired", [
      MIGRATION_LOCK_NAME,
    ]);
    lockAcquired = Number(lockRows[0]?.acquired ?? 0) === 1;
    if (!lockAcquired) throw new Error("获取历史数据迁移锁超时，请稍后重试。");

    const hasRowsAfterLock = (await countBusinessRows(connection)).some((stat) => stat.rows > 0);
    if (hasRowsAfterLock) return;

    const legacyState = await readLegacyState(connection);
    await replaceStateWithConnection(connection, legacyState ?? defaultState);
  } finally {
    if (lockAcquired) await connection.query("SELECT RELEASE_LOCK(?)", [MIGRATION_LOCK_NAME]);
    connection.release();
  }
}

async function readLegacyState(db: Queryable) {
  const rows = await queryRows<LegacyStateRow>(
    db,
    "SELECT payload FROM trip_ledger_state WHERE id = ? LIMIT 1",
    [STATE_ID],
  );
  if (!rows.length) return null;

  const payload = typeof rows[0].payload === "string" ? JSON.parse(rows[0].payload) : rows[0].payload;
  return normalizeAppState(payload);
}

async function replaceState(state: AppState): Promise<AppState> {
  const connection = await getMysqlPool().getConnection();

  try {
    return await replaceStateWithConnection(connection, state);
  } finally {
    connection.release();
  }
}

async function replaceStateWithConnection(connection: PoolConnection, state: AppState): Promise<AppState> {
  const normalized = normalizeAppState(state);

  try {
    await connection.beginTransaction();
    await clearBusinessTables(connection);
    await insertState(connection, normalized);
    await connection.commit();
    return normalized;
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function readStateFromTables(db: Queryable): Promise<AppState> {
  const [
    peopleRows,
    categoryRows,
    tripRows,
    tripMemberRows,
    sharedExpenseRows,
    sharedParticipantRows,
    travelCostRows,
    travelParticipantRows,
    personalExpenseRows,
    adjustmentRows,
  ] = await Promise.all([
    queryRows<PersonRow>(db, "SELECT id, name, note FROM people ORDER BY sort_order, created_at, id"),
    queryRows<CategoryRow>(db, "SELECT name FROM categories ORDER BY sort_order, name"),
    queryRows<TripRow>(db, "SELECT id, title, dates FROM trips ORDER BY sort_order, created_at, id"),
    queryRows<TripMemberRow>(
      db,
      `
        SELECT tm.trip_id, p.id, p.name, p.note
        FROM trip_members tm
        INNER JOIN people p ON p.id = tm.person_id
        ORDER BY tm.trip_id, tm.sort_order, p.name
      `,
    ),
    queryRows<SharedExpenseRow>(
      db,
      `
        SELECT id, trip_id, title, category_name, amount, note
        FROM shared_expenses
        ORDER BY trip_id, sort_order, created_at, id
      `,
    ),
    queryRows<ParticipantRow>(
      db,
      `
        SELECT expense_id AS record_id, person_id
        FROM shared_expense_participants
        ORDER BY expense_id, sort_order, person_id
      `,
    ),
    queryRows<TravelCostRow>(
      db,
      `
        SELECT id, trip_id, title, amount, note
        FROM travel_costs
        ORDER BY trip_id, sort_order, created_at, id
      `,
    ),
    queryRows<ParticipantRow>(
      db,
      `
        SELECT travel_cost_id AS record_id, person_id
        FROM travel_cost_participants
        ORDER BY travel_cost_id, sort_order, person_id
      `,
    ),
    queryRows<PersonalExpenseRow>(
      db,
      `
        SELECT id, trip_id, person_id, title, amount, expense_date, note
        FROM personal_expenses
        ORDER BY trip_id, sort_order, created_at, id
      `,
    ),
    queryRows<AdjustmentRow>(
      db,
      `
        SELECT id, trip_id, person_id, title, amount, note
        FROM adjustments
        ORDER BY trip_id, sort_order, created_at, id
      `,
    ),
  ]);

  const trips: Trip[] = tripRows.map((trip) => ({
    id: trip.id,
    title: trip.title,
    dates: trip.dates ?? "",
    members: [],
    sharedExpenses: [],
    travelCosts: [],
    personalExpenses: [],
    adjustments: [],
  }));
  const tripById = new Map(trips.map((trip) => [trip.id, trip]));
  const sharedParticipants = groupParticipants(sharedParticipantRows);
  const travelParticipants = groupParticipants(travelParticipantRows);

  tripMemberRows.forEach((row) => {
    const trip = tripById.get(row.trip_id);
    if (!trip) return;
    trip.members.push({ id: row.id, name: row.name, note: row.note ?? undefined });
  });

  sharedExpenseRows.forEach((row) => {
    const trip = tripById.get(row.trip_id);
    if (!trip) return;
    trip.sharedExpenses.push({
      id: row.id,
      title: row.title,
      category: row.category_name,
      amount: toNumber(row.amount),
      participantIds: sharedParticipants.get(row.id) ?? [],
      note: row.note ?? undefined,
    });
  });

  travelCostRows.forEach((row) => {
    const trip = tripById.get(row.trip_id);
    if (!trip) return;
    trip.travelCosts.push({
      id: row.id,
      title: row.title,
      amount: toNumber(row.amount),
      participantIds: travelParticipants.get(row.id) ?? [],
      note: row.note ?? undefined,
    });
  });

  personalExpenseRows.forEach((row) => {
    const trip = tripById.get(row.trip_id);
    if (!trip) return;
    trip.personalExpenses.push({
      id: row.id,
      memberId: row.person_id,
      title: row.title,
      amount: toNumber(row.amount),
      date: row.expense_date ?? undefined,
      note: row.note ?? undefined,
    });
  });

  adjustmentRows.forEach((row) => {
    const trip = tripById.get(row.trip_id);
    if (!trip) return;
    trip.adjustments.push({
      id: row.id,
      memberId: row.person_id,
      title: row.title,
      amount: toNumber(row.amount),
      note: row.note ?? undefined,
    });
  });

  return normalizeAppState({
    people: peopleRows.map((person) => ({
      id: person.id,
      name: person.name,
      note: person.note ?? undefined,
    })),
    categories: categoryRows.map((category) => category.name),
    trips,
  });
}

async function clearBusinessTables(connection: PoolConnection) {
  const clearOrder = [
    "shared_expense_participants",
    "travel_cost_participants",
    "adjustments",
    "personal_expenses",
    "travel_costs",
    "shared_expenses",
    "trip_members",
    "trips",
    "categories",
    "people",
  ];

  for (const table of clearOrder) {
    await connection.query(`DELETE FROM ${table}`);
  }
}

async function insertState(connection: PoolConnection, state: AppState) {
  const people = collectPeople(state);
  const categories = collectCategories(state);

  await bulkInsert(
    connection,
    "INSERT INTO people (id, name, note, sort_order) VALUES ?",
    people.map((person, index) => [person.id, normalizedTitle(person.name, "未命名人员"), nullableText(person.note), index]),
  );
  await bulkInsert(
    connection,
    "INSERT INTO categories (name, sort_order) VALUES ?",
    categories.map((category, index) => [category, index]),
  );
  await bulkInsert(
    connection,
    "INSERT INTO trips (id, title, dates, sort_order) VALUES ?",
    state.trips.map((trip, index) => [
      trip.id,
      normalizedTitle(trip.title, "未命名出行"),
      nullableText(trip.dates),
      index,
    ]),
  );

  const tripMemberRows: unknown[][] = [];
  const sharedRows: unknown[][] = [];
  const sharedParticipantRows: unknown[][] = [];
  const travelRows: unknown[][] = [];
  const travelParticipantRows: unknown[][] = [];
  const personalRows: unknown[][] = [];
  const adjustmentRows: unknown[][] = [];
  const peopleIds = new Set(people.map((person) => person.id));

  state.trips.forEach((trip) => {
    const memberIds = new Set(trip.members.map((member) => member.id).filter((id) => peopleIds.has(id)));

    trip.members.forEach((member, index) => {
      if (!peopleIds.has(member.id)) return;
      tripMemberRows.push([trip.id, member.id, index]);
    });

    trip.sharedExpenses.forEach((expense, index) => {
      sharedRows.push([
        expense.id,
        trip.id,
        normalizedTitle(expense.title, "未命名费用"),
        normalizedTitle(expense.category, "其他"),
        expense.amount,
        nullableText(expense.note),
        index,
      ]);
      filterParticipants(expense.participantIds, memberIds).forEach((personId, participantIndex) => {
        sharedParticipantRows.push([expense.id, personId, participantIndex]);
      });
    });

    trip.travelCosts.forEach((cost, index) => {
      travelRows.push([
        cost.id,
        trip.id,
        normalizedTitle(cost.title, "未命名出行费用"),
        cost.amount,
        nullableText(cost.note),
        index,
      ]);
      filterParticipants(cost.participantIds, memberIds).forEach((personId, participantIndex) => {
        travelParticipantRows.push([cost.id, personId, participantIndex]);
      });
    });

    trip.personalExpenses.forEach((expense, index) => {
      if (!memberIds.has(expense.memberId)) return;
      personalRows.push([
        expense.id,
        trip.id,
        expense.memberId,
        normalizedTitle(expense.title, "未命名个人费用"),
        expense.amount,
        nullableText(expense.date),
        nullableText(expense.note),
        index,
      ]);
    });

    trip.adjustments.forEach((adjustment, index) => {
      if (!memberIds.has(adjustment.memberId)) return;
      adjustmentRows.push([
        adjustment.id,
        trip.id,
        adjustment.memberId,
        normalizedTitle(adjustment.title, "未命名自付"),
        adjustment.amount,
        nullableText(adjustment.note),
        index,
      ]);
    });
  });

  await bulkInsert(connection, "INSERT INTO trip_members (trip_id, person_id, sort_order) VALUES ?", tripMemberRows);
  await bulkInsert(
    connection,
    `
      INSERT INTO shared_expenses
        (id, trip_id, title, category_name, amount, note, sort_order)
      VALUES ?
    `,
    sharedRows,
  );
  await bulkInsert(
    connection,
    "INSERT INTO shared_expense_participants (expense_id, person_id, sort_order) VALUES ?",
    sharedParticipantRows,
  );
  await bulkInsert(
    connection,
    "INSERT INTO travel_costs (id, trip_id, title, amount, note, sort_order) VALUES ?",
    travelRows,
  );
  await bulkInsert(
    connection,
    "INSERT INTO travel_cost_participants (travel_cost_id, person_id, sort_order) VALUES ?",
    travelParticipantRows,
  );
  await bulkInsert(
    connection,
    `
      INSERT INTO personal_expenses
        (id, trip_id, person_id, title, amount, expense_date, note, sort_order)
      VALUES ?
    `,
    personalRows,
  );
  await bulkInsert(
    connection,
    "INSERT INTO adjustments (id, trip_id, person_id, title, amount, note, sort_order) VALUES ?",
    adjustmentRows,
  );
}

async function countBusinessRows(db: Queryable): Promise<TableStat[]> {
  const stats: TableStat[] = [];

  for (const table of businessTables) {
    const rows = await queryRows<CountRow>(db, `SELECT COUNT(*) AS count FROM ${table}`);
    stats.push({ table, rows: toNumber(rows[0]?.count ?? 0) });
  }

  return stats;
}

async function queryRows<T extends RowDataPacket>(db: Queryable, sql: string, values?: QueryValues): Promise<T[]> {
  const [rows] = await db.query(sql, values);
  return rows as T[];
}

async function bulkInsert(connection: PoolConnection, sql: string, rows: unknown[][]) {
  if (!rows.length) return;
  await connection.query(sql, [rows]);
}

function collectPeople(state: AppState) {
  const peopleById = new Map<string, Person>();

  state.people.forEach((person) => addPerson(peopleById, person));
  state.trips.forEach((trip) => {
    trip.members.forEach((member) => addPerson(peopleById, member));
  });

  return Array.from(peopleById.values());
}

function addPerson(peopleById: Map<string, Person>, person: Person) {
  if (!person.id || peopleById.has(person.id)) return;
  peopleById.set(person.id, {
    id: person.id,
    name: normalizedTitle(person.name, "未命名人员"),
    note: person.note,
  });
}

function collectCategories(state: AppState) {
  const categories = new Set<string>();
  state.categories.forEach((category) => categories.add(normalizedTitle(category, "其他")));
  state.trips.forEach((trip) => {
    trip.sharedExpenses.forEach((expense) => categories.add(normalizedTitle(expense.category, "其他")));
  });
  return Array.from(categories);
}

function groupParticipants(rows: ParticipantRow[]) {
  const grouped = new Map<string, string[]>();

  rows.forEach((row) => {
    const existing = grouped.get(row.record_id) ?? [];
    existing.push(row.person_id);
    grouped.set(row.record_id, existing);
  });

  return grouped;
}

function filterParticipants(participantIds: string[], memberIds: Set<string>) {
  return Array.from(new Set(participantIds.filter((id) => memberIds.has(id))));
}

function nullableText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizedTitle(value: string, fallback: string) {
  const trimmed = value.trim();
  return trimmed || fallback;
}

function toNumber(value: number | string) {
  return typeof value === "number" ? value : Number(value);
}
