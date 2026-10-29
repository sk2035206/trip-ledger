import assert from "node:assert/strict";
import test from "node:test";
import { appShareInfo, shareInfo } from "../miniprogram/src/lib/share.ts";

test("sharing the mini program opens the public home page without private state", () => {
  const info = appShareInfo();
  assert.equal(info.path, "/pages/home/index");
  assert.ok(info.title.includes("旅行分账"));
  assert.equal(info.imageUrl, "/assets/share-card.png");
  assert.deepEqual(Object.keys(info).sort(), ["imageUrl", "path", "title"]);
});

test("sharing a trip and forwarding its card keep the read-only destination and encoded ID", () => {
  const trip = {id:"旅行 &?#中文",title:"长沙之旅",members:[{name:"不应出现在卡片"}],password:"not-for-sharing"};
  const info=shareInfo(trip);
  const url=new URL(info.path,"https://example.test");
  assert.equal(url.pathname,"/pages/share/index");
  assert.equal(url.searchParams.get("tripId"),trip.id);
  assert.equal([...url.searchParams].length,1);
  assert.equal(info.title,"长沙之旅 · 分账清单");
  assert.equal(info.imageUrl,appShareInfo().imageUrl);
  assert.ok(!JSON.stringify(info).includes(trip.password));
  assert.ok(!JSON.stringify(info).includes(trip.members[0].name));
});
