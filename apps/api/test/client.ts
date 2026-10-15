import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";

export const APP_ORIGIN = "http://localhost:3200";
export const YEP_KEY = "yep_sk_test_0123456789";

let app: Promise<FastifyInstance> | undefined;

/** One app per test file, built after test/setup.ts has prepared the environment and mocks. */
export function getApp(): Promise<FastifyInstance> {
  app ??= buildApp().then(async (built) => {
    await built.ready();
    return built;
  });
  return app;
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type Reply<T = any> = { status: number; body: { ok?: boolean; data?: T; error?: { code: string; message: string; details?: unknown } } & Record<string, any>; headers: Record<string, unknown> };

export type Client = {
  request<T = any>(method: Method, path: string, body?: unknown, headers?: Record<string, string>): Promise<Reply<T>>;
  get<T = any>(path: string): Promise<Reply<T>>;
  post<T = any>(path: string, body?: unknown): Promise<Reply<T>>;
  put<T = any>(path: string, body?: unknown): Promise<Reply<T>>;
  patch<T = any>(path: string, body?: unknown): Promise<Reply<T>>;
  delete<T = any>(path: string): Promise<Reply<T>>;
  /** `data` of a 2xx reply; fails the test with the API's error otherwise. */
  ok<T = any>(method: Method, path: string, body?: unknown): Promise<T>;
};

/** Requests as the dashboard sends them (session cookie, same origin) or as an API client (Bearer key). */
export function client(auth: { cookie?: string; apiKey?: string }): Client {
  const request = async <T>(method: Method, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<Reply<T>> => {
    const headers: Record<string, string> = { ...extra };
    if (auth.cookie) {
      headers.cookie = auth.cookie;
      headers.origin ??= APP_ORIGIN;
    }
    if (auth.apiKey) headers.authorization = `Bearer ${auth.apiKey}`;
    const res = await (await getApp()).inject({ method, url: path.startsWith("/") ? path : `/${path}`, headers, payload: body as never });
    let parsed: Reply<T>["body"] = {};
    try {
      parsed = res.body ? JSON.parse(res.body) : {};
    } catch {
      parsed = { raw: res.body };
    }
    return { status: res.statusCode, body: parsed, headers: res.headers as Record<string, unknown> };
  };
  return {
    request,
    get: (path) => request("GET", `/api${path}`),
    post: (path, body) => request("POST", `/api${path}`, body ?? {}),
    put: (path, body) => request("PUT", `/api${path}`, body ?? {}),
    patch: (path, body) => request("PATCH", `/api${path}`, body ?? {}),
    delete: (path) => request("DELETE", `/api${path}`),
    async ok(method, path, body) {
      const res = await request(method, `/api${path}`, method === "GET" || method === "DELETE" ? undefined : (body ?? {}));
      if (res.status >= 300 || res.body.ok === false) {
        throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(res.body.error ?? res.body)}`);
      }
      return res.body.data as never;
    },
  };
}

let counter = 0;

/** Signs up a fresh user through better-auth and returns a dashboard-style client. */
export async function signUp(name = "Tester"): Promise<{ api: Client; cookie: string; email: string; userId: string }> {
  const email = `user${++counter}-${Date.now()}@example.test`;
  const res = await (await getApp()).inject({
    method: "POST",
    url: "/api/auth/sign-up/email",
    headers: { origin: APP_ORIGIN },
    payload: { name, email, password: "correct horse battery" },
  });
  if (res.statusCode !== 200) throw new Error(`sign-up failed: ${res.statusCode} ${res.body}`);
  const setCookie = res.headers["set-cookie"];
  const cookies = (Array.isArray(setCookie) ? setCookie : [setCookie ?? ""]).map((c) => String(c).split(";")[0]).filter(Boolean);
  const cookie = cookies.join("; ");
  const api = client({ cookie });
  const me = await api.ok<{ user: { id: string } }>("GET", "/me");
  return { api, cookie, email, userId: me.user.id };
}

/** A signed-up user with a YepAPI key and one project in the US market. */
export async function readyUser(project: Record<string, unknown> = {}) {
  const user = await signUp();
  await user.api.ok("PUT", "/settings/yepapi-key", { apiKey: YEP_KEY });
  const created = await user.api.ok<{ id: string; country: string; locationCode: number }>("POST", "/projects", { name: "Acme", domain: "acme.com", ...project });
  return { ...user, project: created };
}
