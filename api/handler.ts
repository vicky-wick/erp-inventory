// Vercel serverless entry: every /api/* request lands here via the rewrite in
// vercel.json (`/api/(.*)` -> `/api/handler`).
//
// Why a rewrite instead of a catch-all filename: on plain Vercel Functions a
// dynamic segment only matches ONE path segment. Both `[[...path]].ts` and
// `[...path].ts` therefore served /api/health but returned a platform 404 for
// /api/auth/me. The rewrite is depth-independent.
//
// Module format: Vercel's Node builder emits ESM and Node picks the format from
// the nearest package.json, so the repo is "type": "module" and every relative
// import carries its .js extension. Never add an api/package.json that says
// "commonjs" - the builder emits ESM anyway and the runtime then dies with
// "SyntaxError: Unexpected token 'export'" (500 FUNCTION_INVOCATION_FAILED).
import type { VercelRequest, VercelResponse } from "@vercel/node";

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void>;

// Loaded lazily so a module-level failure still answers with JSON.
let cachedHandler: Handler | null = null;

async function loadHandler(): Promise<Handler> {
  if (!cachedHandler) {
    const mod = await import("../server/app.js");
    cachedHandler = (mod as unknown as { handleApi: Handler }).handleApi;
  }
  return cachedHandler;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const handleApi = await loadHandler();
    await handleApi(req, res);
  } catch (err) {
    console.error("function error:", err);
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          ok: false,
          error: {
            code: "boot",
            message: err instanceof Error ? err.message : String(err),
          },
        })
      );
    }
  }
}
