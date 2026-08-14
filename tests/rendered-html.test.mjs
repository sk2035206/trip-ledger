import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

test("builds the trip ledger app", async () => {
  const [layout, page, serverEntry, serverManifest] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../dist/server/index.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/server/vinext-server.json", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /shareTitle = "旅行分账"/);
  assert.match(layout, /WechatShare/);
  assert.match(page, /旅行分账工作台/);
  assert.match(page, /全局数据/);
  assert.match(page, /管理类/);
  assert.match(page, /出行管理/);
  assert.match(page, /人员管理/);
  assert.match(page, /类别管理/);
  assert.match(serverEntry, /route:\/api\/state/);
  assert.match(serverEntry, /route:\/api\/health/);
  assert.match(serverManifest, /prerenderSecret/);
  assert.doesNotMatch(page, /请输入访问口令|输入后端访问口令|token-form/);
  assert.doesNotMatch(page, /Your site is taking shape|Building your site/);
});

test("removes starter preview dependencies and files", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /SkeletonPreview|codex-preview|react-loading-skeleton/);
  assert.match(page, /个人费用清单/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview|_sites-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("app/_sites-preview", templateRoot)));
});
