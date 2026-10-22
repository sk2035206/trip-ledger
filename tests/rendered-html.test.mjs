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
  assert.match(page, /请输入访问密码后进入工作台/);
  assert.match(page, /登录状态有效/);
  assert.match(page, /loadWorkbenchSession/);
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

test("supports renaming a roster person without touching expense links", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /renamePersonInState/);
  assert.match(page, /isPersonNameTaken/);
  assert.match(page, /修改姓名/);
  assert.match(page, /保存姓名/);
  assert.match(page, /onEdit=\{openPersonEdit\}/);
  // 人员库列表必须保留编辑入口
  assert.match(page, /className="roster-actions"/);
});

test("supports renaming categories and trips from their management pages", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  // 类别改名要同步公共费用的类别名与清单筛选
  assert.match(page, /renameCategoryInState/);
  assert.match(page, /isCategoryNameTaken/);
  assert.match(page, /修改类别名称/);
  assert.match(page, /onEdit=\{openCategoryEdit\}/);
  assert.match(page, /setSharedCategoryFilter\(\(filter\) => \(filter === from \? to : filter\)\)/);
  assert.match(page, /setDetailFilter\(\(filter\) => \(filter === from \? to : filter\)\)/);

  // 出行账单改名
  assert.match(page, /renameTripInState/);
  assert.match(page, /修改账单名称/);
  assert.match(page, /onEdit=\{openTripEdit\}/);
});

test("labels every rename entry as 编辑 and pins the trip edit to the right", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  // 三处入口统一叫“编辑”，不再出现“改名”
  assert.doesNotMatch(page, /改名/);
  assert.match(page, /aria-label=\{`编辑人员\$\{person\.name\}`\}/);
  assert.match(page, /aria-label=\{`编辑类别\$\{category\}`\}/);
  assert.match(page, /aria-label=\{`编辑账单\$\{trip\.title\}`\}/);

  // 账单编辑按钮位于名称同一行，且在名称之后
  assert.match(page, /className="trip-card-title-row"/);
  const titleRow = page.slice(page.indexOf("trip-card-title-row"), page.indexOf("trip-card-side"));
  assert.ok(titleRow.indexOf("trip-card-main") < titleRow.indexOf("trip-edit-button"));

  // 名称区撑满整行把按钮顶到右侧固定位置；长名称换行不挤压按钮
  assert.match(css, /\.trip-card-main\s*\{[^}]*flex:\s*1 1 auto/);
  assert.match(css, /\.trip-card-main\s*\{[^}]*min-width:\s*0/);
  assert.match(css, /\.trip-edit-button\s*\{[^}]*flex:\s*0 0 auto/);
  assert.match(css, /\.trip-card strong\s*\{[^}]*overflow-wrap:\s*anywhere/);
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
