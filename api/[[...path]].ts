// Vercel serverless entry: /api/[...path]
//
// NOTE: api/package.json sets "type": "commonjs" so Vercel compiles THIS
// function tree as CommonJS. With the root "type": "module", the builder
// emits ESM and the CommonJS `pg` driver crashes at boot with
// "Dynamic require of \"events\" is not supported" (FUNCTION_INVOCATION_FAILED).
import type { VercelRequest, VercelResponse } from "@vercel/node";

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void>;

// The server bundle is loaded lazily inside the request path, so even a
// module-load failure surfaces as JSON from /api/health (with the real
// error message) instead of an opaque platform error page.
let cachedHandler: Handler | null = null;

async function loadHandler(): Promise<Handler> {
  if (!cachedHandler) {
    const mod = (await import("../server/app")) as unknown as { handleApi: Handler };
    cachedHandler = mod.handleApi;
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
