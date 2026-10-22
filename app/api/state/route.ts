const backendBaseUrl = process.env.TRIP_LEDGER_API_URL ?? "http://127.0.0.1:5174";

export async function GET(request: Request) {
  return proxyRequest(request, "/api/state");
}

export async function PUT(request: Request) {
  return proxyRequest(request, "/api/state", {
    method: "PUT",
    body: await request.text(),
  });
}

async function proxyRequest(request: Request, path: string, init?: RequestInit) {
  const cookie = request.headers.get("Cookie");
  const client = request.headers.get("X-Trip-Ledger-Client");
  const session = request.headers.get("X-Workbench-Session");
  const response = await fetch(`${backendBaseUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(client ? { "X-Trip-Ledger-Client": client } : {}),
      ...(session ? { "X-Workbench-Session": session } : {}),
      ...init?.headers,
    },
  });
  const body = await response.text();

  return new Response(body, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
