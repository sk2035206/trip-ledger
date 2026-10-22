import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("mini program logs in with a persisted signed session", async () => {
  const [api, appConfig, homePage, tripPage, store, server, authProxy, stateProxy] = await Promise.all([
    readFile(new URL("../miniprogram/src/lib/api.ts", import.meta.url), "utf8"),
    readFile(new URL("../miniprogram/src/app.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../miniprogram/src/pages/home/index.tsx", import.meta.url), "utf8"),
    readFile(new URL("../miniprogram/src/pages/trip/index.tsx", import.meta.url), "utf8"),
    readFile(new URL("../miniprogram/src/lib/store.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/proxy.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(appConfig, /pages\/login\/index/);
  assert.match(appConfig, /pages\/home\/index/);
  assert.match(api, /X-Trip-Ledger-Client/);
  assert.match(api, /X-Workbench-Session/);
  assert.match(api, /setStorageSync/);
  assert.match(api, /removeStorageSync/);
  assert.match(homePage, /hasMiniSession/);
  assert.match(homePage, /登录并连接/);
  assert.match(homePage, /loginMini/);
  assert.match(tripPage, /hasMiniSession/);
  assert.match(store, /authRequired/);
  assert.doesNotMatch(api, /reLaunch\(\{ url: "\/pages\/login\/index"/);
  assert.match(server, /client === "miniprogram"/);
  assert.match(server, /sessionToken: session\.token/);
  assert.match(authProxy, /X-Trip-Ledger-Client/);
  assert.match(stateProxy, /X-Workbench-Session/);
});
