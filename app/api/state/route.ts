const backendBaseUrl = process.env.TRIP_LEDGER_API_URL ?? "http://127.0.0.1:5174";

export async function GET() {
  return proxyRequest("/api/state");
}

export async function PUT(request: Request) {
  return proxyRequest("/api/state", {
    method: "PUT",
    body: await request.text(),
  });
}

async function proxyRequest(path: string, init?: RequestInit) {
  const response = await fetch(`${backendBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const body = await response.text();

  return new Response(body, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "application/json; charset=utf-8",
    },
  });
}
