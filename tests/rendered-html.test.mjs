import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

test("builds the trip ledger app", async () => {
  const [layout, page, shareRoute, sharePage, serverEntry, serverManifest] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/share/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/share/share-viewer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../dist/server/index.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/server/vinext-server.json", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /shareTitle = "旅行分账"/);
  assert.doesNotMatch(layout, /<WechatShare/);
  assert.match(page, /WechatShare/);
  assert.match(page, /window\.location\.href = shareUrl/);
  assert.match(shareRoute, /generateMetadata/);
  assert.match(shareRoute, /initialTrip/);
  assert.match(sharePage, /WechatShare/);
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

test("guards every destructive action with a confirmation dialog", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  // 账单、成员、公费/出行/个人、人员、类别删除都要先确认
  assert.match(page, /tripPendingDeletion/);
  assert.match(page, /memberPendingRemoval/);
  assert.match(page, /pendingDelete/);
  assert.match(page, /confirmPendingDelete/);
  assert.match(page, /确认删除/);
  assert.match(page, /确认移除/);

  // 三类费用清单不再直接删除，必须先请求确认
  assert.doesNotMatch(page, /onDelete=\{\(id\) => deleteItem\(/);
  assert.match(page, /onDelete=\{requestSharedExpenseDelete\}/);
  assert.match(page, /onDelete=\{requestTravelCostDelete\}/);
  assert.match(page, /onDelete=\{requestPersonalExpenseDelete\}/);
  assert.match(page, /onDelete=\{requestRosterPersonDelete\}/);
  assert.match(page, /onDelete=\{requestCategoryDelete\}/);
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
