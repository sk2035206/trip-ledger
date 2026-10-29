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

import { getPlayPlanRepository, PlayPlanError } from "./mysql/play-plan-repository";
import { handleMaps } from "./maps/handle-maps";
import {createPlayPlanShareService} from './services/play-plan-share-service';
import {readPlanViewCookie,serializePlanViewCookie} from './auth/play-plan-share';
import {handleSharedMaps} from './maps/handle-shared-maps';
import {PlayPlanShareConfig} from './config/play-plan-share-config';

const host = process.env.API_HOST ?? "127.0.0.1";
const port = Number(process.env.API_PORT ?? 5174);
const corsOrigin = process.env.CORS_ORIGIN;
const authConfig = WorkbenchAuthConfig.load();
const shareSecret=PlayPlanShareConfig.load()+':'+authConfig.sessionSecret;

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const apiPath = url.pathname.replace(/^\/ledger(?=\/api(?:\/|$))/, "");

  if (corsOrigin) {
    response.setHeader("Access-Control-Allow-Origin", corsOrigin);
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
    response.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, X-Trip-Ledger-Client, X-Workbench-Session",
    );
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
      const clientHeader = request.headers["x-trip-ledger-client"];
      const client = Array.isArray(clientHeader) ? clientHeader[0] : clientHeader;
      sendJson(
        response,
        200,
        {
          authenticated: true,
          expiresAt: session.expiresAt,
          sessionDays: authConfig.sessionDays,
          ...(client === "miniprogram" ? { sessionToken: session.token } : {}),
        },
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

    const publicPlanMatch=apiPath.match(/^\/api\/play-plan-shares\/([^/]+)(?:\/maps\/([^/]+))?$/);
    if(publicPlanMatch){
      if(request.method!=='GET'){sendJson(response,405,{error:'分享页只支持查看'});return;}
      try{
        const token=decodeURIComponent(publicPlanMatch[1]);
        const snapshot=await createPlayPlanShareService(getPlayPlanRepository(),shareSecret).read(token);
        if(publicPlanMatch[2]){await handleSharedMaps(response,url,publicPlanMatch[2],snapshot);return;}
        sendJson(response,200,snapshot,{'Set-Cookie':serializePlanViewCookie(token,isSecureRequest(request))});return;
      }catch(error){
        const missing=error instanceof URIError||(error instanceof PlayPlanError&&error.status===404);
        if(!missing)console.error('[plan-share-read]',error);
        sendJson(response,missing?404:503,{error:missing?'分享链接无效或计划已移除':'暂时无法读取分享计划，请稍后重试'});return;
      }
    }
    const planShareMatch=apiPath.match(/^\/api\/trips\/([^/]+)\/play-plan\/share$/);
    const playPlanMatch = apiPath.match(/^\/api\/trips\/([^/]+)\/play-plan$/);
    let shareSdk=false;
    if(apiPath.startsWith('/api/maps/_AMapService/')&&request.method==='GET'&&!getWorkbenchSessionExpiration(request,authConfig)){
      const token=readPlanViewCookie(request);
      if(token){try{await createPlayPlanShareService(getPlayPlanRepository(),shareSecret).read(token);shareSdk=true;}catch{/* Invalid/deleted shares cannot authorize SDK requests. */}}
    }

    if ((planShareMatch || playPlanMatch || apiPath.startsWith('/api/maps/')) && !getWorkbenchSessionExpiration(request, authConfig) && !shareSdk) {
      sendJson(response,401,{error:'请先登录'});return;
    }
    if(planShareMatch){if(request.method!=='GET'){sendJson(response,405,{error:'仅支持 GET'});return;}sendJson(response,200,await createPlayPlanShareService(getPlayPlanRepository(),shareSecret).create(decodeURIComponent(planShareMatch[1])));return;}
    if (apiPath.startsWith('/api/maps/')) {
      if (request.method !== 'GET') {sendJson(response,405,{error:'仅支持 GET'});return;}
      await handleMaps(request,response,url,apiPath);return;
    }
    if (playPlanMatch) {
      const tripId=decodeURIComponent(playPlanMatch[1]);
      if(!tripId || tripId.length>64) {sendJson(response,400,{error:'出行ID无效'});return;}
      if(request.method==='GET') {sendJson(response,200,await getPlayPlanRepository().get(tripId));return;}
      if(request.method==='PUT') {
        const payload=await readJson(request,2*1024*1024) as {plan?:unknown;revision?:unknown};
        sendJson(response,200,await getPlayPlanRepository().save(tripId,payload.plan,payload.revision));return;
      }
      sendJson(response,405,{error:'仅支持 GET 和 PUT'});return;
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
