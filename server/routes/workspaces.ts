import {
  route, body, isRecord, str, strOrNull, intOrNull, bool, uuidOrNull,
  ApiRequest, unauthorized, notFound, badRequest, forbidden,
} from "../router";
import { withTx, scopedQuery, pgError } from "../db";
import { requireMembership, requireAdmin } from "../access";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "LKR", "NPR", "BDT"];
const BUSINESS_TYPES = ["eyewear","watches","bags","fashion","jewellery","electronics","general","other"];
const MODULE_KEYS = ["dashboard","inventory","sales","purchases","categories","suppliers","reports","adjustments"];
const CORE_MODULES = ["dashboard","inventory"];

function currencyOf(v: unknown): string {
  const s = typeof v === "string" ? v.toUpperCase() : "";
  return CURRENCIES.includes(s) ? s : "INR";
}

function typeOf(v: unknown): string {
  const s = typeof v === "string" ? v : "";
  return BUSINESS_TYPES.includes(s) ? s : "other";
}

function validLogoUrl(v: unknown): string | null {
  const s = strOrNull(v, 500);
  if (!s) return null;
  // Only allow our own uploaded file path or data URL (uploads are validated elsewhere)
  if (s.startsWith("/api/files/") || s.startsWith("data:image/")) return s;
  return null;
}

export default [
  // ---------------- create workspace (onboarding) ----------------
  route("POST", "/workspaces", async (req: ApiRequest) => {
    if (!req.userId) throw unauthorized();
    const b = body(req, (v) => {
      if (!isRecord(v)) return null;
      const name = str(v.name, 80);
      if (!name) return null;
      return {
        name,
        business_type: typeOf(v.business_type),
        logo_url: validLogoUrl(v.logo_url),
        currency: currencyOf(v.currency),
        phone: strOrNull(v.phone, 20),
        modules: Array.isArray(v.modules)
          ? v.modules.filter((m): m is string => typeof m === "string" && MODULE_KEYS.includes(m))
          : [],
      };
    }, "Your business name is required");

    const wsId = await withTx({ system: true }, async (tx) => {
      try {
        const { rows } = await tx.query(`select create_workspace($1, $2, $3, $4, $5, $6, $7) as id`, [
          req.userId, b.name, b.business_type, b.logo_url, b.currency, b.phone, b.modules,
        ]);
        return rows[0].id as string;
      } catch (err) {
        const pg = pgError(err);
        if (pg?.code === "23514" && pg.message.includes("workspaces_name_check")) {
          throw badRequest("Business name is too long");
        }
        throw err;
      }
    });

    return withTx({ userId: req.userId, workspaceId: wsId }, async (tx) => {
      const { rows } = await tx.query(
        `select w.*, m.role from workspaces w
           join workspace_members m on m.workspace_id = w.id and m.user_id = $2
          where w.id = $1`,
        [wsId, req.userId]
      );
      const { rows: modules } = await tx.query(
        `select module_key, enabled from workspace_modules where workspace_id = $1 order by module_key`, [wsId]
      );
      const { rows: settings } = await tx.query(
        `select * from workspace_settings where workspace_id = $1`, [wsId]
      );
      return { workspace: rows[0], modules, settings: settings[0] };
    });
  }),

  // ---------------- get workspace detail ----------------
  // Membership is enforced by the join below (a non-member gets no row), so
  // this runs as a single query + tx setup = 3 round-trips instead of 9.
  route("GET", "/workspaces/:id", async (req: ApiRequest) => {
    if (!req.userId) throw unauthorized();
    return withTx({ userId: req.userId, workspaceId: req.params.id }, async (tx) => {
      const { rows } = await tx.query(
        `select to_jsonb(w) || jsonb_build_object('role', m.role) as workspace,
                (select coalesce(jsonb_agg(jsonb_build_object('module_key', mo.module_key, 'enabled', mo.enabled) order by mo.module_key), '[]'::jsonb)
                   from workspace_modules mo where mo.workspace_id = w.id) as modules,
                (select to_jsonb(st) from workspace_settings st where st.workspace_id = w.id) as settings,
                (select dp.widgets from dashboard_preferences dp where dp.workspace_id = w.id and dp.user_id = $2) as dashboard_preferences
           from workspaces w
           join workspace_members m on m.workspace_id = w.id and m.user_id = $2
          where w.id = $1`,
        [req.params.id, req.userId]
      );
      if (!rows[0]) throw notFound("Workspace not found");
      const d = rows[0];
      return {
        workspace: d.workspace,
        modules: d.modules,
        settings: d.settings,
        dashboard_preferences: d.dashboard_preferences ?? null,
      };
    });
  }),

  // ---------------- update workspace profile ----------------
  route("PATCH", "/workspaces/:id", async (req: ApiRequest) => {
    const membership = await requireMembership(req, req.params.id);
    requireAdmin(membership.role);
    const b = body(req, (v) => {
      if (!isRecord(v)) return null;
      const out: Record<string, unknown> = {};
      if (v.name !== undefined) { const n = str(v.name, 80); if (!n) return null; out.name = n; }
      if (v.business_type !== undefined) out.business_type = typeOf(v.business_type);
      if (v.logo_url !== undefined) out.logo_url = validLogoUrl(v.logo_url);
      if (v.currency !== undefined) out.currency = currencyOf(v.currency);
      if (v.phone !== undefined) out.phone = strOrNull(v.phone, 20);
      if (v.email !== undefined) out.email = strOrNull(v.email, 200);
      if (v.address !== undefined) out.address = strOrNull(v.address, 500);
      if (v.gstin !== undefined) out.gstin = strOrNull(v.gstin, 20);
      if (v.invoice_prefix !== undefined) out.invoice_prefix = strOrNull(v.invoice_prefix, 10) ?? "INV";
      if (v.invoice_footer !== undefined) out.invoice_footer = strOrNull(v.invoice_footer, 300);
      return Object.keys(out).length ? out : null;
    }, "Nothing to update");

    const keys = Object.keys(b);
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
    return withTx({ userId: req.userId!, workspaceId: req.params.id }, async (tx) => {
      const { rows } = await tx.query(
        `update workspaces set ${sets} where id = $1 returning *`,
        [req.params.id, ...keys.map((k) => b[k])]
      );
      if (!rows[0]) throw notFound();
      return { workspace: rows[0] };
    });
  }),

  // ---------------- inventory settings ----------------
  route("PATCH", "/workspaces/:id/settings", async (req: ApiRequest) => {
    const membership = await requireMembership(req, req.params.id);
    requireAdmin(membership.role);
    const b = body(req, (v) => {
      if (!isRecord(v)) return null;
      const out: Record<string, unknown> = {};
      if (v.low_stock_threshold !== undefined) {
        const n = intOrNull(v.low_stock_threshold);
        if (n === null || n < 0) return null;
        out.low_stock_threshold = n;
      }
      if (v.auto_sku !== undefined) { const x = bool(v.auto_sku); if (x === null) return null; out.auto_sku = x; }
      if (v.allow_manual_sku !== undefined) { const x = bool(v.allow_manual_sku); if (x === null) return null; out.allow_manual_sku = x; }
      if (v.allow_negative_stock !== undefined) { const x = bool(v.allow_negative_stock); if (x === null) return null; out.allow_negative_stock = x; }
      if (v.enable_variants !== undefined) { const x = bool(v.enable_variants); if (x === null) return null; out.enable_variants = x; }
      if (v.sku_prefix !== undefined) out.sku_prefix = strOrNull(v.sku_prefix, 8) ?? "SKU";
      return Object.keys(out).length ? out : null;
    }, "Invalid settings");

    const keys = Object.keys(b);
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
    return withTx({ userId: req.userId!, workspaceId: req.params.id }, async (tx) => {
      const { rows } = await tx.query(
        `update workspace_settings set ${sets} where workspace_id = $1 returning *`,
        [req.params.id, ...keys.map((k) => b[k])]
      );
      return { settings: rows[0] };
    });
  }),

  // ---------------- module toggle ----------------
  route("PATCH", "/workspaces/:id/modules", async (req: ApiRequest) => {
    const membership = await requireMembership(req, req.params.id);
    requireAdmin(membership.role);
    const b = body(req, (v) => {
      if (!isRecord(v)) return null;
      const module_key = typeof v.module_key === "string" ? v.module_key : null;
      const enabled = bool(v.enabled);
      if (!module_key || !MODULE_KEYS.includes(module_key) || enabled === null) return null;
      return { module_key, enabled };
    }, "Unknown module");

    if (CORE_MODULES.includes(b.module_key)) {
      throw badRequest("Core modules cannot be disabled");
    }

    return withTx({ userId: req.userId!, workspaceId: req.params.id }, async (tx) => {
      // If disabling sales/purchases with pending activity, warn rather than block history.
      if (!b.enabled && (b.module_key === "sales" || b.module_key === "purchases")) {
        const pendingWhere =
          b.module_key === "sales"
            ? `status in ('draft','partially_returned')`
            : `status = 'draft'`;
        const { rows: pending } = await tx.query(
          `select count(*)::int as n from ${b.module_key === "sales" ? "sales" : "purchases"} where workspace_id = $1 and ${pendingWhere}`,
          [req.params.id]
        );
        if (pending[0].n > 0) {
          throw new (class extends Error {
            status = 409; code = "pending_transactions";
          })(`There are ${pending[0].n} pending ${b.module_key} records. Records stay preserved, but finish them first if you plan to keep using this module.`);
        }
      }
      const { rows } = await tx.query(
        `insert into workspace_modules (workspace_id, module_key, enabled) values ($1, $2, $3)
         on conflict (workspace_id, module_key) do update set enabled = excluded.enabled
         returning module_key, enabled`,
        [req.params.id, b.module_key, b.enabled]
      );
      return { module: rows[0] };
    });
  }),

  // ---------------- dashboard preferences ----------------
  route("PATCH", "/workspaces/:id/dashboard-preferences", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    const b = body(req, (v) => {
      if (!isRecord(v)) return null;
      return { widgets: v };
    }, "Invalid widget preferences");

    return withTx({ userId: req.userId!, workspaceId: req.params.id }, async (tx) => {
      const { rows } = await tx.query(
        `insert into dashboard_preferences (workspace_id, user_id, widgets)
         values ($1, $2, $3::jsonb)
         on conflict (workspace_id, user_id) do update set widgets = excluded.widgets
         returning widgets`,
        [req.params.id, req.userId, JSON.stringify(b.widgets)]
      );
      return { widgets: rows[0].widgets };
    });
  }),

  // ---------------- file upload (images stored in DB, size/type checked) ----------------
  route("POST", "/workspaces/:id/files", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    const b = body(req, (v) => {
      if (!isRecord(v)) return null;
      const filename = str(v.filename, 120);
      const data = typeof v.data === "string" ? v.data : null;
      const mime = typeof v.mime_type === "string" ? v.mime_type : null;
      if (!filename || !data || !mime) return null;
      return { filename, data, mime };
    }, "Invalid file");

    const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
    const base64 = b.data.includes(",") ? b.data.split(",")[1] : b.data;
    const sizeBytes = Math.floor((base64.length * 3) / 4);
    if (!/^image\/(png|jpeg|webp|gif)$/.test(b.mime)) {
      throw badRequest("Only PNG, JPEG, WebP or GIF images are allowed");
    }
    if (sizeBytes > MAX_BYTES) {
      throw badRequest("Images must be smaller than 2 MB");
    }

    return withTx({ userId: req.userId!, workspaceId: req.params.id }, async (tx) => {
      const { rows } = await tx.query(
        `insert into files (workspace_id, owner_id, filename, mime_type, size_bytes, data)
         values ($1, $2, $3, $4, $5, $6) returning id`,
        [req.params.id, req.userId, b.filename, b.mime, sizeBytes, base64]
      );
      return { file_url: `/api/files/${rows[0].id}` };
    });
  }),

  // ---------------- fetch a stored file ----------------
  route("GET", "/files/:id", async (req: ApiRequest) => {
    const rows = await scopedQuery<{ mime_type: string; data: string }>(
      req.userId ? { userId: req.userId } : {},
      `select mime_type, data from files where id = $1`,
      [req.params.id]
    );
    const file = rows[0];
    if (!file) throw notFound("File not found");
    return { mime_type: file.mime_type, data_base64: file.data };
  }),
];
