import { ApiRequest, ApiError, matchRouteList, notFound, route } from "./router";
import { resolveToken } from "./auth";
import authRoutes from "./routes/auth";
import workspaceRoutes from "./routes/workspaces";
import inventoryRoutes from "./routes/inventory";
import transactionRoutes from "./routes/transactions";
import analyticsRoutes from "./routes/analytics";
import type { Route } from "./router";

const routes: Route[] = [
  // Deployment diagnostic: tells you instantly whether the API function is
  // live and whether its database configuration is present.
  route("GET", "/health", async () => ({
    status: "ok",
    database_configured: Boolean(process.env.DATABASE_URL),
    node: process.version,
  })),
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
  // CORS (harmless same-origin, required if the SPA is ever hosted separately)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  const method = (req.method ?? "GET").toUpperCase();
  if (method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    let path = url.pathname.replace(/^\/api\/?/, "/");
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

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
      const msg = err instanceof Error && /DATABASE_URL|connection string/i.test(err.message)
        ? "Server is missing its database configuration (DATABASE_URL)."
        : "Something went wrong. Please try again.";
      send(res, 500, { ok: false, error: { code: "internal", message: msg } });
    }
  }
}
