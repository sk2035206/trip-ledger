import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { WorkbenchAuthSettings } from "../config/workbench-auth-config";

const millisecondsPerDay = 24 * 60 * 60 * 1000;

export function verifyWorkbenchPassword(input: unknown, config: WorkbenchAuthSettings) {
  if (typeof input !== "string") return false;
  return secureEqual(input, config.password);
}

export function createWorkbenchSession(config: WorkbenchAuthSettings, now = Date.now()) {
  const expiresAt = now + config.sessionDays * millisecondsPerDay;
  return {
    expiresAt,
    token: `${expiresAt}.${signExpiration(expiresAt, config.sessionSecret)}`,
  };
}

export function getWorkbenchSessionExpiration(
  request: IncomingMessage,
  config: WorkbenchAuthSettings,
  now = Date.now(),
) {
  const sessionHeader = request.headers["x-workbench-session"];
  const headerToken = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
  const token = headerToken?.trim() || parseCookies(request.headers.cookie ?? "")[config.cookieName];
  if (!token) return null;

  const separator = token.indexOf(".");
  if (separator < 1) return null;
  const expiresAt = Number(token.slice(0, separator));
  const signature = token.slice(separator + 1);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;

  const expected = signExpiration(expiresAt, config.sessionSecret);
  return secureEqual(signature, expected) ? expiresAt : null;
}

export function serializeWorkbenchSessionCookie(
  token: string,
  config: WorkbenchAuthSettings,
  secure: boolean,
) {
  const maxAge = Math.round(config.sessionDays * 24 * 60 * 60);
  return serializeCookie(config.cookieName, token, maxAge, secure);
}

export function serializeWorkbenchLogoutCookie(config: WorkbenchAuthSettings, secure: boolean) {
  return serializeCookie(config.cookieName, "", 0, secure);
}

export function isSecureRequest(request: IncomingMessage) {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  return proto?.split(",")[0]?.trim() === "https";
}

function signExpiration(expiresAt: number, secret: string) {
  return createHmac("sha256", secret).update(String(expiresAt)).digest("base64url");
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parseCookies(header: string) {
  const cookies: Record<string, string> = {};
  header.split(";").forEach((part) => {
    const separator = part.indexOf("=");
    if (separator < 1) return;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  });
  return cookies;
}

function serializeCookie(name: string, value: string, maxAge: number, secure: boolean) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}
