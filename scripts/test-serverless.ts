// Verify the Vercel serverless entry (api/[[...path]].ts) against a real
// HTTP server, so what we test is exactly what runs on Vercel.
import { createServer } from "node:http";
import handler from "../api/[[...path]].ts";

const server = createServer(async (req, res) => {
  await handler(req as never, res as never);
});

await new Promise<void>((resolve) => server.listen(8799, resolve));
console.log("test server on 8799");

const base = "http://localhost:8799/api";
async function call(name, path, init) {
  const t0 = Date.now();
  const res = await fetch(base + path, init);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { nonJson: text.slice(0, 120) }; }
  console.log(`${name}: ${res.status} ${Math.round(Date.now() - t0)}ms ->`, JSON.stringify(json).slice(0, 220));
  return json;
}

await call("health", "/health");
const login = await call("login", "/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "owner3@evolv.test", password: "testpass123" }),
});
if (login?.data?.token) {
  const h = { Authorization: `Bearer ${login.data.token}` };
  const me = await fetch(base + "/auth/boot", { headers: h });
  console.log("boot:", me.status, JSON.stringify(await me.json()).slice(0, 160));
} else {
  console.log("login failed — no token");
}
server.close();
process.exit(0);
