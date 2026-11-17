import { Pool, type PoolClient } from "pg";
import "dotenv/config";

declare global {
  // eslint-disable-next-line no-var
  var __evolvPool: Pool | undefined;
}

export const pool =
  globalThis.__evolvPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    application_name: "evolv-api",
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__evolvPool = pool;
}

export type TxContext = {
  userId?: string;
  workspaceId?: string;
  system?: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Assert a string is a genuine uuid so it can be safely inlined as an SQL literal. */
function assertUuid(v: string): string {
  if (!UUID_RE.test(v)) throw new Error("invalid uuid literal");
  return v;
}

/**
 * Convert query params to SQL literals when every param is a validated uuid,
 * a finite integer, a boolean or null — i.e. values our own code constructed.
 * Returns null when any param needs the parameterised (extend-protocol) path.
 */
function inlineLiterals(params: unknown[]): string[] | null {
  const out: string[] = [];
  for (const p of params) {
    if (p === null || p === undefined) out.push("null");
    else if (typeof p === "boolean") out.push(p ? "true" : "false");
    else if (typeof p === "number" && Number.isInteger(p) && Math.abs(p) < 2 ** 53) out.push(String(p));
    else if (typeof p === "string" && UUID_RE.test(p)) out.push(`'${p}'::uuid`);
    else return null;
  }
  return out;
}

/** Replace every $N placeholder with its inlined literal. */
function substitute(sql: string, literals: string[]): string {
  return sql.replace(/\$(\d+)/g, (m, n) => {
    const i = Number(n) - 1;
    return i < literals.length ? literals[i] : m;
  });
}

/**
 * Inline validated params into a statement so it can ride the simple protocol
 * (required for multi-statement batches). Throws when any param is not
 * safely inlinable — callers must pass only code-constructed uuids/ints.
 */
export function inlined(sql: string, params: unknown[]): string {
  const lits = inlineLiterals(params);
  if (!lits) throw new Error("params not inlinable for batch statement");
  return substitute(sql, lits);
}

/** The set_config statements that establish the RLS context.
 *  set_config takes text, so quote the pre-validated uuid plainly (its charset
 *  [0-9a-f-] needs no SQL escaping). */
function scopeConfigs(ctx: TxContext): string[] {
  const parts: string[] = [];
  if (ctx.system) parts.push("select set_config('app.system','on',true)");
  if (ctx.userId) parts.push(`select set_config('app.user_id','${assertUuid(ctx.userId)}',true)`);
  if (ctx.workspaceId) parts.push(`select set_config('app.workspace_id','${assertUuid(ctx.workspaceId)}',true)`);
  return parts;
}

/**
 * Run work inside a transaction with the RLS security context set.
 * The begin + scope setup is a single round-trip (simple protocol), so the
 * whole transaction costs setup(1) + N queries + commit round-trips.
 */
export async function withTx<T>(
  ctx: TxContext,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    const setup = ["begin", ...scopeConfigs(ctx)].join(";\n");
    await client.query(setup);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* connection already broken */
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Read-only work scoped for RLS. The scope setup and the statement ride ONE
 * round-trip in every case:
 *  - inlinable params (uuids/ints/bools/null from our own validators) ride a
 *    tiny explicit transaction via the simple protocol;
 *  - otherwise the configs become a materialized CTE of the statement itself
 *    (a single statement is its own transaction, so is_local=true holds).
 */
export async function scopedQuery<T extends Record<string, unknown>>(
  ctx: TxContext,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const client = await pool.connect();
  try {
    const configs: string[] = [];
    const cfgParams: unknown[] = [];
    if (ctx.system) {
      cfgParams.push("on");
      configs.push(`set_config('app.system', $${cfgParams.length}::text, true)`);
    }
    if (ctx.userId) {
      cfgParams.push(ctx.userId);
      configs.push(`set_config('app.user_id', $${cfgParams.length}::text, true)`);
    }
    if (ctx.workspaceId) {
      cfgParams.push(ctx.workspaceId);
      configs.push(`set_config('app.workspace_id', $${cfgParams.length}::text, true)`);
    }

    const literals = inlineLiterals(params);
    if (literals && configs.length) {
      // Fast path: begin + literal configs + query + commit in one round-trip.
      const parts = ["begin", ...scopeConfigs(ctx), substitute(sql, literals), "commit"];
      const results = await client.query(parts.join(";\n")) as unknown as Array<{ rows: T[] }>;
      const data = results[1 + scopeConfigs(ctx).length];
      return data.rows;
    }
    if (literals) {
      // No scope needed at all — plain single round-trip.
      const results = await client.query(substitute(sql, literals)) as unknown as { rows: T[] };
      return results.rows;
    }

    // Parameterised path: hoist the scope configs into the statement itself.
    // The query's own $N placeholders must be renumbered past the config params.
    const bump = cfgParams.length;
    const renumbered = bump
      ? sql.replace(/\$(\d+)/g, (m, n) => `$${Number(n) + bump}`)
      : sql;
    const full = configs.length
      ? `with rls_scope as materialized (select ${configs.join(", ")}) ${renumbered}`
      : renumbered;
    const result = await client.query(full, [...cfgParams, ...params]);
    return result.rows as T[];
  } catch (err) {
    // A partially-executed simple-protocol batch can leave a txn open.
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Extract a clean Postgres error for the API layer. */
export function pgError(err: unknown): { code: string; message: string } | null {
  if (typeof err === "object" && err !== null && "code" in err && "message" in err) {
    const e = err as { code?: string; message?: string };
    return typeof e.code === "string" && typeof e.message === "string" ? { code: e.code, message: e.message } : null;
  }
  return null;
}
