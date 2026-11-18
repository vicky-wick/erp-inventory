// Local dev API server (proxied by Vite at /api -> localhost:8787)
import { createServer } from "node:http";
import { handleApi } from "./app.js";

const port = Number(process.env.PORT ?? 8787);

createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  try {
    await handleApi(req as never, res as never);
  } catch (err) {
    console.error(err);
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.end(JSON.stringify({ ok: false, error: { code: "internal", message: "Internal error" } }));
    }
  }
}).listen(port, () => {
  console.log(`EVOLV API ready at http://localhost:${port}`);
});
