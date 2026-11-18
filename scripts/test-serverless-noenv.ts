// Verify that a deployment WITHOUT DATABASE_URL returns JSON 500 with a
// clear message, instead of a plain-text crash ("Couldn't reach the server").
process.env.DATABASE_URL = "";
import handler from "../api/[[...path]].ts";
import { createServer } from "node:http";

const server = createServer(async (req, res) => {
  await handler(req as never, res as never);
});
await new Promise<void>((resolve) => server.listen(8798, resolve));

const res = await fetch("http://localhost:8798/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "a@b.c", password: "x".repeat(10) }),
});
console.log("status:", res.status);
console.log("content-type:", res.headers.get("content-type"));
console.log("body:", (await res.text()).slice(0, 200));
server.close();
process.exit(0);
