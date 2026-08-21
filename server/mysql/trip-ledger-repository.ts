import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type { AppState, Person, Trip } from "../../frontend/trip-types";
import { normalizeAppState } from "../../frontend/trip-utils";
import { getMysqlPool } from "./pool";

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

type ConstraintRow = RowDataPacket & {
  CONSTRAINT_NAME: string;
};

type IndexRow = RowDataPacket & {
  INDEX_NAME: string;
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
  payer_person_id: string | null;
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

type ParticipantRow = RowDataPacket & {
  record_id: string;
  person_id: string;
};

let schemaPromise: Promise<void> | null = null;

const schemaStatements = [
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
      PRIMARY KEY (trip_id, person_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='出行账本成员关联表'
  `,
  `
    CREATE TABLE IF NOT EXISTS shared_expenses (
      id VARCHAR(96) NOT NULL PRIMARY KEY COMMENT '公共费用ID',
      trip_id VARCHAR(64) NOT NULL COMMENT '出行账本ID',
      title VARCHAR(200) NOT NULL COMMENT '费用事项名称',
      category_name VARCHAR(100) NOT NULL COMMENT '公共费用类别名称',
      amount DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '费用金额',
      payer_person_id VARCHAR(64) NULL COMMENT '付款人员ID，NULL表示公共付款',
      note TEXT NULL COMMENT '备注',
      sort_order INT NOT NULL DEFAULT 0 COMMENT '排序值',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='公共费用明细表'
  `,
  `
    CREATE TABLE IF NOT EXISTS shared_expense_participants (
      expense_id VARCHAR(96) NOT NULL COMMENT '公共费用ID',
      trip_id VARCHAR(64) NOT NULL COMMENT '出行账本ID，冗余便于按账单查询',
      person_id VARCHAR(64) NOT NULL COMMENT '参与分摊人员ID',
      title VARCHAR(200) NOT NULL COMMENT '公共费用事项名称冗余字段',
      sort_order INT NOT NULL DEFAULT 0 COMMENT '排序值',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      PRIMARY KEY (expense_id, person_id)
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
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='出行费用明细表'
  `,
  `
    CREATE TABLE IF NOT EXISTS travel_cost_participants (
      travel_cost_id VARCHAR(96) NOT NULL COMMENT '出行费用ID',
      person_id VARCHAR(64) NOT NULL COMMENT '参与分摊人员ID',
      title VARCHAR(200) NOT NULL COMMENT '出行费用事项名称冗余字段',
      sort_order INT NOT NULL DEFAULT 0 COMMENT '排序值',
      PRIMARY KEY (travel_cost_id, person_id)
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
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='个人费用明细表'
  `,
];

const relationshipForeignKeys = [
  { table: "trip_members", name: "fk_trip_members_trip" },
  { table: "trip_members", name: "fk_trip_members_person" },
  { table: "shared_expenses", name: "fk_shared_expenses_trip" },
  { table: "shared_expenses", name: "fk_shared_expenses_payer" },
  { table: "shared_expense_participants", name: "fk_shared_expense_participants_expense" },
  { table: "shared_expense_participants", name: "fk_shared_expense_participants_person" },
  { table: "travel_costs", name: "fk_travel_costs_trip" },
  { table: "travel_cost_participants", name: "fk_travel_cost_participants_cost" },
  { table: "travel_cost_participants", name: "fk_travel_cost_participants_person" },
  { table: "personal_expenses", name: "fk_personal_expenses_trip" },
  { table: "personal_expenses", name: "fk_personal_expenses_person" },
] as const;

const relationshipIndexes = [
  { table: "trip_members", name: "idx_trip_members_person" },
  { table: "shared_expenses", name: "idx_shared_expenses_trip" },
  { table: "shared_expenses", name: "idx_shared_expenses_category" },
  { table: "shared_expenses", name: "idx_shared_expenses_payer" },
  { table: "shared_expense_participants", name: "idx_shared_expense_participants_person" },
  { table: "travel_costs", name: "idx_travel_costs_trip" },
  { table: "travel_cost_participants", name: "idx_travel_cost_participants_person" },
  { table: "personal_expenses", name: "idx_personal_expenses_trip" },
  { table: "personal_expenses", name: "idx_personal_expenses_person" },
] as const;

const schemaCommentStatements = [
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
  "ALTER TABLE shared_expenses MODIFY payer_person_id VARCHAR(64) NULL COMMENT '付款人员ID，NULL表示公共付款'",
  "ALTER TABLE shared_expenses MODIFY note TEXT NULL COMMENT '备注'",
  "ALTER TABLE shared_expenses MODIFY sort_order INT NOT NULL DEFAULT 0 COMMENT '排序值'",
  "ALTER TABLE shared_expenses MODIFY created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'",
  "ALTER TABLE shared_expenses MODIFY updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'",
  "ALTER TABLE shared_expense_participants COMMENT = '公共费用参与分摊人员表'",
  "ALTER TABLE shared_expense_participants MODIFY expense_id VARCHAR(96) NOT NULL COMMENT '公共费用ID'",
  "ALTER TABLE shared_expense_participants MODIFY trip_id VARCHAR(64) NOT NULL COMMENT '出行账本ID，冗余便于按账单查询'",
  "ALTER TABLE shared_expense_participants MODIFY person_id VARCHAR(64) NOT NULL COMMENT '参与分摊人员ID'",
  "ALTER TABLE shared_expense_participants MODIFY title VARCHAR(200) NOT NULL COMMENT '公共费用事项名称冗余字段'",
  "ALTER TABLE shared_expense_participants MODIFY sort_order INT NOT NULL DEFAULT 0 COMMENT '排序值'",
  "ALTER TABLE shared_expense_participants MODIFY created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'",
  "ALTER TABLE shared_expense_participants MODIFY updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'",
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
  "ALTER TABLE travel_cost_participants MODIFY title VARCHAR(200) NOT NULL COMMENT '出行费用事项名称冗余字段'",
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
  await ensureSharedExpensePayerColumn(db);
  await ensureParticipantTitleColumns(db);
  await ensureSharedParticipantMetadataColumns(db);
  await db.execute("DROP TABLE IF EXISTS adjustments");
  await removeRelationshipConstraints(db);
  for (const statement of schemaCommentStatements) {
    await db.execute(statement);
  }
}

async function ensureSharedParticipantMetadataColumns(db: Pool) {
  if (!(await columnExists(db, "shared_expense_participants", "trip_id"))) {
    await db.execute(
      "ALTER TABLE shared_expense_participants ADD COLUMN trip_id VARCHAR(64) NULL COMMENT '出行账本ID，冗余便于按账单查询' AFTER expense_id",
    );
  }
  await db.execute(
    `UPDATE shared_expense_participants participant
     INNER JOIN shared_expenses expense ON expense.id = participant.expense_id
     SET participant.trip_id = expense.trip_id
     WHERE participant.trip_id IS NULL OR participant.trip_id = ''`,
  );
  await db.execute(
    "UPDATE shared_expense_participants SET trip_id = 'unknown' WHERE trip_id IS NULL OR trip_id = ''",
  );

  if (!(await columnExists(db, "shared_expense_participants", "created_at"))) {
    await db.execute(
      "ALTER TABLE shared_expense_participants ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间' AFTER sort_order",
    );
  }
  if (!(await columnExists(db, "shared_expense_participants", "updated_at"))) {
    await db.execute(
      "ALTER TABLE shared_expense_participants ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间' AFTER created_at",
    );
  }
}

async function columnExists(db: Pool, table: string, column: string) {
  const [rows] = await db.query<Array<RowDataPacket & { count: number | string }>>(
    `
      SELECT COUNT(*) AS count
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
    `,
    [table, column],
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

async function ensureParticipantTitleColumns(db: Pool) {
  await ensureParticipantTitleColumn(db, "shared_expense_participants", "expense_id", "shared_expenses", "未命名费用");
  await ensureParticipantTitleColumn(db, "travel_cost_participants", "travel_cost_id", "travel_costs", "未命名出行费用");
}

async function ensureParticipantTitleColumn(
  db: Pool,
  participantTable: string,
  recordIdColumn: string,
  sourceTable: string,
  fallbackTitle: string,
) {
  const [rows] = await db.query<Array<RowDataPacket & { count: number | string }>>(
    `
      SELECT COUNT(*) AS count
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = 'title'
    `,
    [participantTable],
  );
  if (Number(rows[0]?.count ?? 0) === 0) {
    await db.execute(`ALTER TABLE ${participantTable} ADD COLUMN title VARCHAR(200) NULL COMMENT '事项名称冗余字段' AFTER person_id`);
  }

  await db.execute(
    `UPDATE ${participantTable} participant INNER JOIN ${sourceTable} source ON source.id = participant.${recordIdColumn} SET participant.title = source.title WHERE participant.title IS NULL OR participant.title = ''`,
  );
  await db.execute(`UPDATE ${participantTable} SET title = ? WHERE title IS NULL OR title = ''`, [fallbackTitle]);
}

async function ensureSharedExpensePayerColumn(db: Pool) {
  const [rows] = await db.query<Array<RowDataPacket & { count: number | string }>>(
    `
      SELECT COUNT(*) AS count
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'shared_expenses'
        AND COLUMN_NAME = 'payer_person_id'
    `,
  );
  if (Number(rows[0]?.count ?? 0) > 0) return;

  await db.execute(
    "ALTER TABLE shared_expenses ADD COLUMN payer_person_id VARCHAR(64) NULL COMMENT '付款人员ID，NULL表示公共付款' AFTER amount",
  );
}

async function removeRelationshipConstraints(db: Pool) {
  for (const foreignKey of relationshipForeignKeys) {
    if (await foreignKeyExists(db, foreignKey.table, foreignKey.name)) {
      await db.execute(`ALTER TABLE ${foreignKey.table} DROP FOREIGN KEY ${foreignKey.name}`);
    }
  }

  for (const index of relationshipIndexes) {
    if (await indexExists(db, index.table, index.name)) {
      await db.execute(`ALTER TABLE ${index.table} DROP INDEX ${index.name}`);
    }
  }
}

async function foreignKeyExists(db: Pool, table: string, name: string) {
  const rows = await queryRows<ConstraintRow>(
    db,
    `
      SELECT CONSTRAINT_NAME
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND CONSTRAINT_NAME = ?
        AND CONSTRAINT_TYPE = 'FOREIGN KEY'
      LIMIT 1
    `,
    [table, name],
  );
  return rows.length > 0;
}

async function indexExists(db: Pool, table: string, name: string) {
  const rows = await queryRows<IndexRow>(
    db,
    `
      SELECT INDEX_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
      LIMIT 1
    `,
    [table, name],
  );
  return rows.length > 0;
}

export async function getBusinessTableStats(): Promise<TableStat[]> {
  await ensureSchema();
  return countBusinessRows(getMysqlPool());
}

export async function readAppState(): Promise<AppState> {
  await ensureSchema();
  return readStateFromTables(getMysqlPool());
}

export async function writeAppState(state: unknown): Promise<AppState> {
  await ensureSchema();
  return replaceState(normalizeAppState(state));
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
    await syncState(connection, normalized);
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
        SELECT id, trip_id, title, category_name, amount, payer_person_id, note
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
  ]);

  const trips: Trip[] = tripRows.map((trip) => ({
    id: trip.id,
    title: trip.title,
    dates: trip.dates ?? "",
    members: [],
    sharedExpenses: [],
    travelCosts: [],
    personalExpenses: [],
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
      payerId: row.payer_person_id ?? undefined,
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

async function syncState(connection: PoolConnection, state: AppState) {
  const people = collectPeople(state);
  const categories = collectCategories(state);

  await bulkInsert(
    connection,
    `INSERT INTO people (id, name, note, sort_order) VALUES ?
     ON DUPLICATE KEY UPDATE name = VALUES(name), note = VALUES(note), sort_order = VALUES(sort_order)`,
    people.map((person, index) => [person.id, normalizedTitle(person.name, "未命名人员"), nullableText(person.note), index]),
  );
  await bulkInsert(
    connection,
    `INSERT INTO categories (name, sort_order) VALUES ?
     ON DUPLICATE KEY UPDATE sort_order = VALUES(sort_order)`,
    categories.map((category, index) => [category, index]),
  );
  await bulkInsert(
    connection,
    `INSERT INTO trips (id, title, dates, sort_order) VALUES ?
     ON DUPLICATE KEY UPDATE title = VALUES(title), dates = VALUES(dates), sort_order = VALUES(sort_order)`,
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
        memberIds.has(expense.payerId ?? "") ? expense.payerId : null,
        nullableText(expense.note),
        index,
      ]);
      filterParticipants(expense.participantIds, memberIds).forEach((personId, participantIndex) => {
        sharedParticipantRows.push([
          expense.id,
          trip.id,
          personId,
          normalizedTitle(expense.title, "未命名费用"),
          participantIndex,
        ]);
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
        travelParticipantRows.push([cost.id, personId, normalizedTitle(cost.title, "未命名出行费用"), participantIndex]);
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

  });

  await bulkInsert(
    connection,
    `INSERT INTO trip_members (trip_id, person_id, sort_order) VALUES ?
     ON DUPLICATE KEY UPDATE sort_order = VALUES(sort_order)`,
    tripMemberRows,
  );
  await bulkInsert(
    connection,
    `
      INSERT INTO shared_expenses
        (id, trip_id, title, category_name, amount, payer_person_id, note, sort_order)
      VALUES ?
      ON DUPLICATE KEY UPDATE
        trip_id = VALUES(trip_id),
        title = VALUES(title),
        category_name = VALUES(category_name),
        amount = VALUES(amount),
        payer_person_id = VALUES(payer_person_id),
        note = VALUES(note),
        sort_order = VALUES(sort_order)
    `,
    sharedRows,
  );
  await bulkInsert(
    connection,
    `INSERT INTO shared_expense_participants (expense_id, trip_id, person_id, title, sort_order) VALUES ?
     ON DUPLICATE KEY UPDATE
       trip_id = VALUES(trip_id), title = VALUES(title), sort_order = VALUES(sort_order)`,
    sharedParticipantRows,
  );
  await bulkInsert(
    connection,
    `INSERT INTO travel_costs (id, trip_id, title, amount, note, sort_order) VALUES ?
     ON DUPLICATE KEY UPDATE
       trip_id = VALUES(trip_id), title = VALUES(title), amount = VALUES(amount),
       note = VALUES(note), sort_order = VALUES(sort_order)`,
    travelRows,
  );
  await bulkInsert(
    connection,
    `INSERT INTO travel_cost_participants (travel_cost_id, person_id, title, sort_order) VALUES ?
     ON DUPLICATE KEY UPDATE title = VALUES(title), sort_order = VALUES(sort_order)`,
    travelParticipantRows,
  );
  await bulkInsert(
    connection,
    `
      INSERT INTO personal_expenses
        (id, trip_id, person_id, title, amount, expense_date, note, sort_order)
      VALUES ?
      ON DUPLICATE KEY UPDATE
        trip_id = VALUES(trip_id),
        person_id = VALUES(person_id),
        title = VALUES(title),
        amount = VALUES(amount),
        expense_date = VALUES(expense_date),
        note = VALUES(note),
        sort_order = VALUES(sort_order)
    `,
    personalRows,
  );

  await deleteMissingCompositeRows(
    connection,
    "shared_expense_participants",
    ["expense_id", "person_id"],
    sharedParticipantRows.map((row) => [String(row[0]), String(row[2])]),
  );
  await deleteMissingCompositeRows(
    connection,
    "travel_cost_participants",
    ["travel_cost_id", "person_id"],
    travelParticipantRows.map((row) => [String(row[0]), String(row[1])]),
  );
  await deleteMissingCompositeRows(
    connection,
    "trip_members",
    ["trip_id", "person_id"],
    tripMemberRows.map((row) => [String(row[0]), String(row[1])]),
  );
  await deleteMissingRows(connection, "personal_expenses", "id", personalRows.map((row) => String(row[0])));
  await deleteMissingRows(connection, "travel_costs", "id", travelRows.map((row) => String(row[0])));
  await deleteMissingRows(connection, "shared_expenses", "id", sharedRows.map((row) => String(row[0])));
  await deleteMissingRows(connection, "trips", "id", state.trips.map((trip) => trip.id));
  await deleteMissingRows(connection, "categories", "name", categories);
  await deleteMissingRows(connection, "people", "id", people.map((person) => person.id));
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

async function deleteMissingRows(
  connection: PoolConnection,
  table: string,
  column: string,
  values: Array<string | number>,
) {
  if (!values.length) {
    await connection.query(`DELETE FROM ${table}`);
    return;
  }
  await connection.query(`DELETE FROM ${table} WHERE ${column} NOT IN (?)`, [values]);
}

async function deleteMissingCompositeRows(
  connection: PoolConnection,
  table: string,
  columns: [string, string],
  keys: Array<[string, string]>,
) {
  if (!keys.length) {
    await connection.query(`DELETE FROM ${table}`);
    return;
  }

  const retainedKeys = keys.map(() => `(${columns[0]} = ? AND ${columns[1]} = ?)`).join(" OR ");
  await connection.query(`DELETE FROM ${table} WHERE NOT (${retainedKeys})`, keys.flat());
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
