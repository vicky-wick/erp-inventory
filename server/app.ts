import { ApiRequest, ApiError, matchRouteList, notFound } from "./router";
import { resolveToken } from "./auth";
import authRoutes from "./routes/auth";
import workspaceRoutes from "./routes/workspaces";
import inventoryRoutes from "./routes/inventory";
import transactionRoutes from "./routes/transactions";
import analyticsRoutes from "./routes/analytics";
import type { Route } from "./router";

const routes: Route[] = [
  ...authRoutes,
  ...workspaceRoutes,
  ...inventoryRoutes,
  ...transactionRoutes,
  ...analyticsRoutes,
];

type NodeReq = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  [key: string]: unknown;
};

type NodeRes = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
};

async function readBody(req: NodeReq): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req as unknown as AsyncIterable<Buffer | string>) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    if (Buffer.concat(chunks).length > 8 * 1024 * 1024) {
      throw new ApiError(413, "too_large", "Request body too large");
    }
  }
  if (!chunks.length) return null;
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function send(res: NodeRes, status: number, data: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

export async function handleApi(req: NodeReq, res: NodeRes): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  let path = url.pathname.replace(/^\/api\/?/, "/");
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  const method = (req.method ?? "GET").toUpperCase();

  const tokenHeader = req.headers.authorization;
  const token = typeof tokenHeader === "string" && tokenHeader.startsWith("Bearer ")
    ? tokenHeader.slice(7)
    : undefined;

  let userId: string | null = null;
  let sessionId: string | null = null;
  const session = await resolveToken(token);
  if (session) {
    userId = session.userId;
    sessionId = session.sessionId;
  }

  const apiReq: ApiRequest = {
    method,
    path,
    params: {},
    query: url.searchParams,
    body: null,
    token,
    userId,
    sessionId,
  };

  try {
    if (method !== "GET" && method !== "DELETE") {
      apiReq.body = await readBody(req);
    }
    const matched = matchRouteList(routes, method, path);
    if (!matched) throw notFound(`No route for ${method} ${path}`);
    apiReq.params = matched.params;
    const result = await matched.route.handler(apiReq);
    send(res, 200, { ok: true, data: result });
  } catch (err) {
    if (err instanceof ApiError) {
      send(res, err.status, { ok: false, error: { code: err.code, message: err.message } });
    } else {
      console.error("API error:", err);
      send(res, 500, { ok: false, error: { code: "internal", message: "Something went wrong. Please try again." } });
    }
  }
}
