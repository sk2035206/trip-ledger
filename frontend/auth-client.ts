type AuthSession = {
  authenticated: boolean;
  expiresAt?: number | null;
  sessionDays: number;
};

export async function loadWorkbenchSession() {
  return authRequest("/api/auth/session", "GET");
}

export async function loginWorkbench(password: string) {
  return authRequest("/api/auth/login", "POST", { password });
}

export async function logoutWorkbench() {
  return authRequest("/api/auth/logout", "POST");
}

async function authRequest(path: string, method: "GET" | "POST", body?: unknown): Promise<AuthSession> {
  const response = await fetch(path, {
    method,
    cache: "no-store",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = (await response.json()) as Partial<AuthSession> & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "登录服务暂时不可用");
  return {
    authenticated: Boolean(payload.authenticated),
    expiresAt: payload.expiresAt,
    sessionDays: typeof payload.sessionDays === "number" ? payload.sessionDays : 7,
  };
}
