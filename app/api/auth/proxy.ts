const backendBaseUrl = process.env.TRIP_LEDGER_API_URL ?? "http://127.0.0.1:5174";

export async function proxyAuthRequest(request: Request, path: string, method: "GET" | "POST") {
  const cookie = request.headers.get("Cookie");
  const response = await fetch(`${backendBaseUrl}${path}`, {
    method,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(method === "POST" ? { body: await request.text() } : {}),
  });
  const body = await response.text();
  const headers = new Headers({
    "Content-Type": response.headers.get("Content-Type") ?? "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  const setCookie = response.headers.get("Set-Cookie");
  if (setCookie) headers.set("Set-Cookie", setCookie);

  return new Response(body, { status: response.status, headers });
}
