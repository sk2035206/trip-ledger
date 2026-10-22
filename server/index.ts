import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { URL } from "node:url";
import {
  createWorkbenchSession,
  getWorkbenchSessionExpiration,
  isSecureRequest,
  serializeWorkbenchLogoutCookie,
  serializeWorkbenchSessionCookie,
  verifyWorkbenchPassword,
} from "./auth/workbench-auth";
import { WorkbenchAuthConfig } from "./config/workbench-auth-config";
import { readJson, sendJson, toApiError } from "./http/json";
import { getLedgerState, getLedgerTrip, getStorageHealth, saveLedgerState } from "./services/trip-ledger-service";

const host = process.env.API_HOST ?? "127.0.0.1";
const port = Number(process.env.API_PORT ?? 5174);
const corsOrigin = process.env.CORS_ORIGIN;
const authConfig = WorkbenchAuthConfig.load();

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const apiPath = url.pathname.replace(/^\/ledger(?=\/api(?:\/|$))/, "");

  if (corsOrigin) {
    response.setHeader("Access-Control-Allow-Origin", corsOrigin);
    response.setHeader("Access-Control-Allow-Methods", "GET,PUT,OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    if (apiPath === "/api/health" && request.method === "GET") {
      sendJson(response, 200, await getStorageHealth());
      return;
    }

    if (apiPath === "/api/share-card.png" && (request.method === "GET" || request.method === "HEAD")) {
      const image = request.method === "GET" ? await readFile(join(process.cwd(), "public", "share-card.png")) : null;
      response.writeHead(200, {
        "Cache-Control": "public, max-age=86400",
        "Content-Type": "image/png",
      });
      if (image) {
        response.end(image);
      } else {
        response.end();
      }
      return;
    }

    if (apiPath === "/api/auth/login" && request.method === "POST") {
      const payload = (await readJson(request)) as { password?: unknown };
      if (!verifyWorkbenchPassword(payload.password, authConfig)) {
        sendJson(response, 401, { error: "密码错误" });
        return;
      }
      const session = createWorkbenchSession(authConfig);
      sendJson(
        response,
        200,
        { authenticated: true, expiresAt: session.expiresAt, sessionDays: authConfig.sessionDays },
        { "Set-Cookie": serializeWorkbenchSessionCookie(session.token, authConfig, isSecureRequest(request)) },
      );
      return;
    }

    if (apiPath === "/api/auth/session" && request.method === "GET") {
      const expiresAt = getWorkbenchSessionExpiration(request, authConfig);
      sendJson(response, 200, {
        authenticated: Boolean(expiresAt),
        expiresAt,
        sessionDays: authConfig.sessionDays,
      });
      return;
    }

    if (apiPath === "/api/auth/logout" && request.method === "POST") {
      sendJson(
        response,
        200,
        { authenticated: false, sessionDays: authConfig.sessionDays },
        { "Set-Cookie": serializeWorkbenchLogoutCookie(authConfig, isSecureRequest(request)) },
      );
      return;
    }

    if (apiPath === "/api/state" && !getWorkbenchSessionExpiration(request, authConfig)) {
      sendJson(response, 401, { error: "请先登录" });
      return;
    }

    if (apiPath === "/api/state" && request.method === "GET") {
      sendJson(response, 200, await getLedgerState());
      return;
    }

    const tripMatch = apiPath.match(/^\/api\/trips\/([^/]+)$/);
    if (tripMatch && request.method === "GET") {
      const trip = await getLedgerTrip(decodeURIComponent(tripMatch[1]));
      if (!trip) {
        sendJson(response, 404, { error: "出行账单不存在" });
        return;
      }
      sendJson(response, 200, { trip });
      return;
    }

    if (apiPath === "/api/state" && request.method === "PUT") {
      const payload = (await readJson(request)) as { state?: unknown; revision?: unknown };
      sendJson(response, 200, await saveLedgerState(payload.state, payload.revision));
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    console.error("[api-error]", error);
    const status = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 500;
    sendJson(response, status, { error: toApiError(error) });
  }
});

server.listen(port, host, () => {
  console.log(`Trip Ledger API listening on http://${host}:${port}`);
});
