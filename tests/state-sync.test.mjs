import assert from "node:assert/strict";
import test from "node:test";
import { stateRevision, assertRevision } from "../server/state/revision.ts";
import { saveStateTransaction } from "../server/state/save-transaction.ts";
import { createStateClient } from "../frontend/state-client.ts";

const initial = () => ({ people: [], categories: ["其他"], trips: [] });
test("revision ignores object property order and undefined SQL fields", () => {
  const a = {
    ...initial(),
    people: [{ id: "a", name: "甲", note: undefined }],
  };
  const b = {
    trips: [],
    people: [{ name: "甲", id: "a" }],
    categories: ["其他"],
  };
  assert.equal(stateRevision(a), stateRevision(b));
  assert.notEqual(
    stateRevision(a),
    stateRevision({ ...a, categories: ["交通"] }),
  );
  assert.throws(() => assertRevision(a, undefined), { status: 428 });
  assert.throws(() => assertRevision(a, stateRevision(initial())), {
    status: 409,
  });
});

function memoryDatabase() {
  let state = initial();
  let gate = Promise.resolve();
  const events = [];
  function connection(id) {
    let unlock;
    let draft;
    return {
      async query(sql) {
        if (sql.includes("GET_LOCK")) {
          const before = gate;
          gate = new Promise((resolve) => {
            unlock = resolve;
          });
          await before;
          events.push(`${id}:lock`);
          return [[{ acquired: 1 }]];
        }
        if (sql.includes("RELEASE_LOCK")) {
          events.push(`${id}:unlock`);
          unlock();
        }
        return [[]];
      },
      async beginTransaction() {
        events.push(`${id}:begin`);
        draft = structuredClone(state);
      },
      async commit() {
        events.push(`${id}:commit`);
        state = draft;
      },
      async rollback() {
        events.push(`${id}:rollback`);
      },
      release() {
        events.push(`${id}:release`);
      },
      async read() {
        return structuredClone(draft);
      },
      async write(next) {
        draft = structuredClone(next);
      },
    };
  }
  return {
    connection,
    events,
    get state() {
      return state;
    },
  };
}
test("two writers with the same revision cannot overwrite one another", async () => {
  const db = memoryDatabase();
  const revision = stateRevision(db.state);
  const a = db.connection("a");
  const b = db.connection("b");
  const first = { ...initial(), people: [{ id: "a", name: "甲" }] };
  const second = { ...initial(), people: [{ id: "b", name: "乙" }] };
  const results = await Promise.allSettled([
    saveStateTransaction(
      a,
      "ledger",
      revision,
      (c) => c.read(),
      (c) => c.write(first),
    ),
    saveStateTransaction(
      b,
      "ledger",
      revision,
      (c) => c.read(),
      (c) => c.write(second),
    ),
  ]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.equal(results[1].reason.status, 409);
  assert.deepEqual(db.state, first);
  assert.ok(db.events.indexOf("a:unlock") < db.events.indexOf("b:begin"));
  assert.ok(db.events.includes("b:rollback"));
  assert.ok(db.events.includes("b:release"));
});
test("failed writes roll back and release the cross-process lock", async () => {
  const db = memoryDatabase();
  const connection = db.connection("a");
  await assert.rejects(
    saveStateTransaction(
      connection,
      "ledger",
      stateRevision(db.state),
      (c) => c.read(),
      async () => {
        throw new Error("write failed");
      },
    ),
    /write failed/,
  );
  assert.deepEqual(db.state, initial());
  assert.deepEqual(db.events.slice(-3), [
    "a:rollback",
    "a:unlock",
    "a:release",
  ]);
});
test("lock timeout never starts a write", async () => {
  let writes = 0;
  let released = false;
  const connection = {
    query: async () => [[{ acquired: 0 }]],
    rollback: async () => {},
    release: () => {
      released = true;
    },
  };
  await assert.rejects(
    saveStateTransaction(
      connection,
      "ledger",
      "old",
      async () => initial(),
      async () => {
        writes++;
      },
    ),
    { status: 503 },
  );
  assert.equal(writes, 0);
  assert.equal(released, true);
});
test("editors keep their own revision, conflict blocks retries until explicit refresh", async () => {
  let state = initial();
  let writes = 0;
  const transport = async (_path, method, body) => {
    if (method === "PUT") {
      writes++;
      if (body.revision !== stateRevision(state))
        return { status: 409, data: { error: "conflict" } };
      state = body.state;
    }
    return {
      status: 200,
      data: { state: structuredClone(state), revision: stateRevision(state) },
    };
  };
  const h5 = createStateClient(transport);
  const mini = createStateClient(transport);
  await Promise.all([h5.load(), mini.load()]);
  await h5.save({ ...initial(), people: [{ id: "a", name: "甲" }] });
  await assert.rejects(mini.save({ ...initial(), people: [] }), {
    status: 409,
  });
  const count = writes;
  await assert.rejects(mini.save(initial()), { status: 409 });
  assert.equal(writes, count);
  await mini.load();
  await mini.save({ ...state, categories: ["交通"] });
  assert.deepEqual(state.people, [{ id: "a", name: "甲" }]);
});
test("load failures and old servers cannot cause saving seed data", async () => {
  let writes = 0;
  const client = createStateClient(async (_path, method) => {
    if (method === "PUT") writes++;
    return { status: 200, data: { state: initial() } };
  });
  await assert.rejects(client.load(), { status: 502 });
  await assert.rejects(client.save(initial()), { status: 428 });
  assert.equal(writes, 0);
});
test("transient save failures preserve revision for a deliberate retry", async () => {
  let fail = true;
  const state = initial();
  const client = createStateClient(async (_path, method, body) => {
    if (method === "PUT" && fail) {
      fail = false;
      throw new Error("offline");
    }
    if (method === "PUT") assert.equal(body.revision, stateRevision(state));
    return { status: 200, data: { state, revision: stateRevision(state) } };
  });
  await client.load();
  await assert.rejects(client.save(state), /offline/);
  await client.save(state);
});
test("a second save cannot enter the transport while the first is pending", async () => {
  let finish;
  let requests = 0;
  const state = initial();
  const client = createStateClient(async (_path, method) => {
    if (method === "PUT") {
      requests++;
      await new Promise((resolve) => {
        finish = resolve;
      });
    }
    return { status: 200, data: { state, revision: stateRevision(state) } };
  });
  await client.load();
  const first = client.save(state);
  await assert.rejects(client.save(state), { status: 429 });
  assert.equal(requests, 1);
  finish();
  await first;
});
