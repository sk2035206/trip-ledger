const backendBaseUrl = process.env.TRIP_LEDGER_API_URL ?? "http://127.0.0.1:5174";

export async function GET() {
  const response = await fetch(`${backendBaseUrl}/api/health`, {
    headers: {
      Accept: "application/json",
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
