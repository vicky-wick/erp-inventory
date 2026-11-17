import { route, body, isRecord, str, strOrNull, emailOrNull, badRequest, unauthorized, ApiRequest } from "../router";
import { withTx, scopedQuery, pgError } from "../db";
import {
  hashPassword, verifyPassword, createSession, destroySession,
  createPasswordReset, consumePasswordReset,
} from "../auth";
import { pool } from "../db";

const PASSWORD_MIN = 8;
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function passwordOf(b: unknown): string | null {
  if (!isRecord(b)) return null;
  const p = b.password;
  return typeof p === "string" && p.length >= PASSWORD_MIN && p.length <= 200 ? p : null;
}

export default [
  // ---------------- register ----------------
  route("POST", "/auth/register", async (req: ApiRequest) => {
    const b = body(req, (v) => {
      if (!isRecord(v)) return null;
      const email = emailOrNull(v.email);
      const password = passwordOf(v);
      if (!email || !password) return null;
      return { email, password, name: strOrNull(v.name, 80) ?? "" };
    }, "Enter a valid email and a password of at least 8 characters");

    return withTx({ system: true }, async (tx) => {
      try {
        const { rows } = await tx.query(
          `insert into profiles (email, password_hash, name) values ($1, $2, $3) returning id, email, name`,
          [b.email, await hashPassword(b.password), b.name]
        );
        const user = rows[0];
        const token = await createSession(user.id, tx as never);
        return { user, token };
      } catch (err) {
        const pg = pgError(err);
        if (pg?.code === "23505") throw badRequest("An account with this email already exists");
        throw err;
      }
    });
  }),

  // ---------------- login ----------------
  route("POST", "/auth/login", async (req: ApiRequest) => {
    const b = body(req, (v) => {
      if (!isRecord(v)) return null;
      const email = emailOrNull(v.email);
      const password = typeof v.password === "string" && v.password ? v.password : null;
      if (!email || !password) return null;
      return { email, password };
    }, "Enter your email and password");

    const { rows } = await pool.query(
      `select id, email, name, password_hash from profiles where email = $1`,
      [b.email]
    );
    const user = rows[0];
    if (!user || !(await verifyPassword(b.password, user.password_hash))) {
      throw unauthorized("Incorrect email or password");
    }
    const token = await createSession(user.id);
    return { user: { id: user.id, email: user.email, name: user.name }, token };
  }),

  // ---------------- me ----------------
  route("GET", "/auth/me", async (req: ApiRequest) => {
    if (!req.userId) throw unauthorized();
    const { rows } = await pool.query(
      `select id, email, name, phone from profiles where id = $1`,
      [req.userId]
    );
    const user = rows[0];
    if (!user) throw unauthorized();
    // workspaces this user belongs to
    const ws = await scopedQuery(
      { userId: req.userId },
      `select w.id, w.name, w.logo_url, w.currency, w.business_type, m.role
         from workspaces w
         join workspace_members m on m.workspace_id = w.id and m.user_id = $1
        order by w.created_at`,
      [req.userId]
    );
    return { user, workspaces: ws };
  }),

  // ---------------- update profile / password ----------------
  route("PATCH", "/auth/me", async (req: ApiRequest) => {
    if (!req.userId) throw unauthorized();
    const b = body(req, (v) => {
      if (!isRecord(v)) return null;
      const name = v.name === undefined ? undefined : strOrNull(v.name, 80);
      const phone = v.phone === undefined ? undefined : strOrNull(v.phone, 20);
      if (name === undefined && phone === undefined) return null;
      return { name, phone };
    }, "Nothing to update");

    await pool.query(
      `update profiles set
         name = coalesce($1, name),
         phone = coalesce($2, phone)
       where id = $3`,
      [b.name, b.phone, req.userId]
    );
    const { rows } = await pool.query(
      `select id, email, name, phone from profiles where id = $1`, [req.userId]
    );
    return { user: rows[0] };
  }),

  route("POST", "/auth/change-password", async (req: ApiRequest) => {
    if (!req.userId) throw unauthorized();
    const b = body(req, (v) => {
      if (!isRecord(v)) return null;
      const current = typeof v.current_password === "string" ? v.current_password : null;
      const next = passwordOf(v.new_password) ?? null;
      if (!current || !next) return null;
      return { current, next };
    }, "Enter your current and a new password (min 8 characters)");

    const { rows } = await pool.query(
      `select password_hash from profiles where id = $1`, [req.userId]
    );
    if (!rows[0] || !(await verifyPassword(b.current, rows[0].password_hash))) {
      throw badRequest("Your current password is incorrect");
    }
    await pool.query(`update profiles set password_hash = $1 where id = $2`, [
      await hashPassword(b.next), req.userId,
    ]);
    return { ok: true };
  }),

  // ---------------- logout ----------------
  route("POST", "/auth/logout", async (req: ApiRequest) => {
    if (req.sessionId) await destroySession(req.sessionId);
    return { ok: true };
  }),

  // ---------------- boot (one-shot app bootstrap) ----------------
  // Returns user + workspaces + active workspace detail + dashboard in ONE
  // database round-trip: the entire chain rides a single simple-protocol
  // batch. Falls back to the user's first workspace when none is requested.
  route("GET", "/auth/boot", async (req: ApiRequest) => {
    if (!req.userId || !UUID_RX.test(req.userId)) throw unauthorized();
    const uid = req.userId;
    const requested = req.query.get("workspace");
    const wantWs = requested && UUID_RX.test(requested) ? `'${requested}'::uuid` : "null::uuid";

    // First workspace of the user — used when the client did not send one.
    const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
    const firstWs = `(select w2.id from workspaces w2
                       join workspace_members m2 on m2.workspace_id = w2.id
                      where m2.user_id = '${uid}'::uuid
                      order by w2.created_at limit 1)`;
    const wsId = `coalesce(${wantWs}, ${firstWs}, '${ZERO_UUID}')`;

    const batch = [
      "begin",
      `select set_config('app.user_id', '${uid}', true)`,
      // user + workspace list
      `select to_jsonb(p) - 'password_hash' as "user",
              coalesce(jsonb_agg(to_jsonb(x) order by x.created_at) filter (where x.id is not null), '[]'::jsonb) as workspaces
         from profiles p
         left join lateral (
           select w.id, w.name, w.logo_url, w.currency, w.business_type, m.role, w.created_at
             from workspace_members m
             join workspaces w on w.id = m.workspace_id
            where m.user_id = p.id
         ) x on true
        where p.id = '${uid}'::uuid
        group by p.id`,
      `select set_config('app.workspace_id', ${wsId}::text, true)`,
      // active workspace detail (membership enforced by the join). With the
      // zero-uuid sentinel the query yields no rows when there is no
      // workspace — never a cast error.
      `select to_jsonb(w) || jsonb_build_object('role', m.role) as workspace,
              (select coalesce(jsonb_agg(jsonb_build_object('module_key', mo.module_key, 'enabled', mo.enabled) order by mo.module_key), '[]'::jsonb)
                 from workspace_modules mo where mo.workspace_id = w.id) as modules,
              (select to_jsonb(st) from workspace_settings st where st.workspace_id = w.id) as settings,
              (select dp.widgets from dashboard_preferences dp where dp.workspace_id = w.id and dp.user_id = '${uid}'::uuid) as dashboard_preferences
         from workspaces w
         join workspace_members m on m.workspace_id = w.id and m.user_id = '${uid}'::uuid
        where w.id = ${wsId}`,
      // dashboard payload; null when no workspace. Even if the planner
      // evaluates the else branch for the sentinel uuid, every cast is valid
      // and every subquery just returns empty results.
      `select case when current_setting('app.workspace_id', true) = '${ZERO_UUID}' then null else
         jsonb_build_object(
           'stats', (select dashboard_stats(current_setting('app.workspace_id')::uuid, 7)),
           'recent_sales', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
              select id, sale_no, customer_name, total, payment_method, status, created_at
                from sales where workspace_id = current_setting('app.workspace_id')::uuid
               order by created_at desc limit 5) x),
           'recent_purchases', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
              select id, purchase_no, total, status, purchase_date, supplier_id
                from purchases where workspace_id = current_setting('app.workspace_id')::uuid
               order by created_at desc limit 5) x),
           'low_stock', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
              select p.id, p.name, p.sku, p.image_url, p.stock_qty, p.min_stock,
                     greatest(p.min_stock, coalesce(s.low_stock_threshold,5)) as threshold
                from products p cross join workspace_settings s
               where s.workspace_id = p.workspace_id
                 and p.workspace_id = current_setting('app.workspace_id')::uuid
                 and p.status = 'active'
                 and p.stock_qty <= greatest(p.min_stock, coalesce(s.low_stock_threshold,5))
               order by p.stock_qty asc limit 8) x)
         ) end as dash`,
      "commit",
    ];

    const client = await pool.connect();
    try {
      // One round-trip for the whole boot sequence.
      const results = await client.query(batch.join(";\n")) as unknown as Array<{
        rows: Array<Record<string, unknown>>;
      }>;
      const me = results[2].rows[0];
      if (!me) throw unauthorized();
      const wRow = results[4].rows[0] ?? null;
      return {
        user: me.user,
        workspaces: me.workspaces,
        workspace: wRow,
        dashboard: results[5].rows[0]?.dash ?? null,
      };
    } catch (err) {
      console.error("[boot] batch failed:", (err as Error).message);
      console.error("[boot] batch sql:\n" + batch.join(";\n"));
      await client.query("rollback").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }),

  // ---------------- forgot / reset password ----------------
  route("POST", "/auth/forgot-password", async (req: ApiRequest) => {
    const b = body(req, (v) => {
      if (!isRecord(v)) return null;
      return { email: emailOrNull(v.email) };
    }, "Enter your account email");

    const { rows } = await pool.query(
      `select id from profiles where email = $1`, [b.email]
    );
    if (!rows[0]) {
      // Do not reveal account existence
      return { ok: true, reset_token: null };
    }
    const token = await createPasswordReset(rows[0].id);
    // No email provider configured: expose the token in development only.
    if (process.env.NODE_ENV === "production") {
      return { ok: true, reset_token: null };
    }
    return { ok: true, reset_token: token };
  }),

  route("POST", "/auth/reset-password", async (req: ApiRequest) => {
    const b = body(req, (v) => {
      if (!isRecord(v)) return null;
      const token = typeof v.token === "string" && v.token ? v.token : null;
      const next = passwordOf(v.password);
      if (!token || !next) return null;
      return { token, next };
    }, "A valid reset token and new password are required");

    const userId = await consumePasswordReset(b.token);
    if (!userId) throw badRequest("This reset link is invalid or has expired");
    await pool.query(`update profiles set password_hash = $1 where id = $2`, [
      await hashPassword(b.next), userId,
    ]);
    return { ok: true };
  }),
];
