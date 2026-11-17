import { Pool } from "pg";
import "dotenv/config";

const p = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const r = await p.query("delete from profiles where email like 'bootprobe%' returning email");
console.log("removed probe users:", r.rows.map((x) => x.email).join(", ") || "none");
await p.end();
