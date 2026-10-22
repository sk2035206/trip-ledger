import { proxyAuthRequest } from "../proxy";

export async function GET(request: Request) {
  return proxyAuthRequest(request, "/api/auth/session", "GET");
}
