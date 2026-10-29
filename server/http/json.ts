import type { IncomingMessage, ServerResponse } from "node:http";

export function sendJson(response: ServerResponse, status: number, payload: unknown, headers: Record<string, string> = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

export async function readJson(request: IncomingMessage, maxBytes = Infinity) {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const bytes=Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if(size > maxBytes) throw Object.assign(new Error("请求内容过大"),{status:413});
    chunks.push(bytes);
  }

  const content = Buffer.concat(chunks).toString("utf8");
  return content ? JSON.parse(content) : {};
}

export function toApiError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unexpected server error";
}
