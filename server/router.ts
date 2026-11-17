export type ApiRequest = {
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  token: string | undefined;
  userId: string | null;
  sessionId: string | null;
};

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (msg: string) => new ApiError(400, "bad_request", msg);
export const unauthorized = (msg = "Authentication required") => new ApiError(401, "unauthorized", msg);
export const forbidden = (msg = "Not allowed") => new ApiError(403, "forbidden", msg);
export const notFound = (msg = "Not found") => new ApiError(404, "not_found", msg);
export const conflict = (msg: string) => new ApiError(409, "conflict", msg);

type Handler = (req: ApiRequest) => Promise<unknown>;

export type Route = {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  pattern: string; // e.g. "/workspaces/:id/modules"
  handler: Handler;
};

export function route(
  method: Route["method"],
  pattern: string,
  handler: Handler
): Route {
  return { method, pattern, handler };
}

function matchRoute(route: Route, method: string, path: string): Record<string, string> | null {
  if (route.method !== method) return null;
  const routeParts = route.pattern.split("/").filter(Boolean);
  const pathParts = path.split("/").filter(Boolean);
  if (routeParts.length !== pathParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < routeParts.length; i++) {
    const rp = routeParts[i];
    if (rp.startsWith(":")) {
      params[rp.slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (rp !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

export function matchRouteList(routes: Route[], method: string, path: string) {
  for (const r of routes) {
    const params = matchRoute(r, method, path);
    if (params) return { route: r, params };
  }
  return null;
}

/** Typed body accessor with basic validation. */
export function body<T>(req: ApiRequest, validate: (b: unknown) => T | null, error = "Invalid request body"): T {
  const result = validate(req.body);
  if (result === null) throw badRequest(error);
  return result;
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function str(v: unknown, maxLen = 500): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed || trimmed.length > maxLen) return null;
  return trimmed;
}

export function strOrNull(v: unknown, maxLen = 500): string | null {
  if (v === undefined || v === null || v === "") return null;
  return str(v, maxLen);
}

export function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function intOrNull(v: unknown): number | null {
  const n = num(v);
  if (n === null) return null;
  if (!Number.isInteger(n)) return null;
  return n;
}

export function bool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  return null;
}

export function uuidOrNull(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null;
}

export function emailOrNull(v: unknown): string | null {
  const s = str(v, 200);
  if (!s) return null;
  const email = s.toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
