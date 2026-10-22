import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  createWorkbenchSession,
  getWorkbenchSessionExpiration,
  serializeWorkbenchSessionCookie,
  verifyWorkbenchPassword,
} from "../server/auth/workbench-auth.ts";
import { WorkbenchAuthConfig } from "../server/config/workbench-auth-config.ts";

const exampleConfigUrl = new URL("../config/workbench-auth.example.json", import.meta.url);
const config = WorkbenchAuthConfig.load(fileURLToPath(exampleConfigUrl));

test("workbench auth reads password and session duration from config", async () => {
  const fileConfig = JSON.parse(await readFile(exampleConfigUrl, "utf8"));
  assert.equal(config.sessionDays, 7);
  assert.equal(config.password, fileConfig.password);
  assert.equal(config.sessionDays, fileConfig.sessionDays);
  assert.equal(verifyWorkbenchPassword(fileConfig.password, config), true);
  assert.equal(verifyWorkbenchPassword("wrong-password", config), false);
});

test("workbench sessions expire and reject tampering", () => {
  const now = Date.UTC(2026, 9, 21, 0, 0, 0);
  const session = createWorkbenchSession(config, now);
  const request = { headers: { cookie: `${config.cookieName}=${session.token}` } };

  assert.equal(getWorkbenchSessionExpiration(request, config, now), session.expiresAt);
  assert.equal(getWorkbenchSessionExpiration(request, config, session.expiresAt), null);

  const tamperedRequest = { headers: { cookie: `${config.cookieName}=${session.token}x` } };
  assert.equal(getWorkbenchSessionExpiration(tamperedRequest, config, now), null);

  const miniRequest = { headers: { "x-workbench-session": session.token } };
  assert.equal(getWorkbenchSessionExpiration(miniRequest, config, now), session.expiresAt);
});

test("workbench cookie is http-only and lasts seven days", () => {
  const session = createWorkbenchSession(config, 0);
  const cookie = serializeWorkbenchSessionCookie(session.token, config, true);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Max-Age=604800/);
  assert.match(cookie, /Secure/);
});
