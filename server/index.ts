import { createServer } from "node:http";
import { URL } from "node:url";
import { readJson, sendJson, toApiError } from "./http/json";
import { getLedgerState, getStorageHealth, saveLedgerState } from "./services/trip-ledger-service";

const host = process.env.API_HOST ?? "127.0.0.1";
const port = Number(process.env.API_PORT ?? 5174);
const corsOrigin = process.env.CORS_ORIGIN;

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

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
    if (url.pathname === "/api/health" && request.method === "GET") {
      sendJson(response, 200, await getStorageHealth());
      return;
    }

    if (url.pathname === "/api/state" && request.method === "GET") {
      sendJson(response, 200, { state: await getLedgerState() });
      return;
    }

    if (url.pathname === "/api/state" && request.method === "PUT") {
      const payload = (await readJson(request)) as { state?: unknown };
      sendJson(response, 200, { state: await saveLedgerState(payload.state) });
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    console.error("[api-error]", error);
    sendJson(response, 500, { error: toApiError(error) });
  }
});

server.listen(port, host, () => {
  console.log(`Trip Ledger API listening on http://${host}:${port}`);
});
