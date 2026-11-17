import {
  route, body, isRecord, str, strOrNull, intOrNull, uuidOrNull, bool,
  ApiRequest, unauthorized, notFound, badRequest, conflict,
} from "../router";
import { withTx, scopedQuery, pgError } from "../db";
import { requireMembership } from "../access";

const DUPLICATE_SKU = "23505";

export default [
  // ---------------- list products ----------------
  route("GET", "/workspaces/:id/products", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    const q = req.query;
    const search = q.get("search")?.trim() ?? "";
    const category = uuidOrNull(q.get("category_id"));
    const status = q.get("status") === "archived" ? "archived" : "active";
    const stock = q.get("stock"); // all | low | out | ok
    const sort = q.get("sort") ?? "name";
    const page = Math.max(1, intOrNull(q.get("page")) ?? 1);
    const perPage = Math.min(100, Math.max(10, intOrNull(q.get("per_page")) ?? 30));
    const offset = (page - 1) * perPage;

    const conditions = ["p.workspace_id = $1", "p.status = $2"];
    const params: unknown[] = [req.params.id, status];
    let pn = 2;

    if (search) {
      pn++;
      conditions.push(`(p.name ilike $${pn} or p.sku ilike $${pn} or coalesce(p.barcode,'') ilike $${pn} or coalesce(p.brand,'') ilike $${pn})`);
      params.push(`%${search}%`);
    }
    if (category) {
      pn++;
      conditions.push(`p.category_id = $${pn}`);
      params.push(category);
    }
    const thresholdExpr = `greatest(p.min_stock, coalesce(s.low_stock_threshold, 5))`;
    let stockCond = "";
    if (stock === "low") stockCond = ` and p.stock_qty > 0 and p.stock_qty <= ${thresholdExpr}`;
    else if (stock === "out") stockCond = ` and p.stock_qty = 0`;
    else if (stock === "ok") stockCond = ` and p.stock_qty > ${thresholdExpr}`;

    const orderBy =
      sort === "price_asc" ? "p.selling_price asc" :
      sort === "price_desc" ? "p.selling_price desc" :
      sort === "qty_asc" ? "p.stock_qty asc" :
      sort === "qty_desc" ? "p.stock_qty desc" :
      sort === "newest" ? "p.created_at desc" :
      "lower(p.name) asc";

    const rows = await scopedQuery(
      { userId: req.userId!, workspaceId: req.params.id },
      `select p.id, p.sku, p.name, p.brand, p.image_url, p.selling_price, p.purchase_price,
              p.stock_qty, p.min_stock, p.has_variants, p.barcode, p.status, p.created_at, p.updated_at,
              c.name as category_name, c.id as category_id,
              (p.stock_qty <= greatest(p.min_stock, coalesce(s.low_stock_threshold,5))) as is_low_stock
         from products p
         left join categories c on c.id = p.category_id
         cross join workspace_settings s
        where s.workspace_id = p.workspace_id and ${conditions.join(" and ")}${stockCond}
        order by ${orderBy}
        limit ${perPage + 1} offset ${offset}`,
      params
    );
    const hasMore = rows.length > perPage;
    return { products: rows.slice(0, perPage), page, has_more: hasMore };
  }),

  // ---------------- get product detail (with variants, attributes, movements) ----------------
  // One statement (correlated scalar subqueries) instead of four sequential queries.
  route("GET", "/workspaces/:id/products/:pid", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    const rows = await scopedQuery<{
      product: Record<string, unknown>; variants: unknown[]; attributes: unknown[]; movements: unknown[];
    }>(
      { userId: req.userId!, workspaceId: req.params.id },
      `select
         to_jsonb(p) || jsonb_build_object(
           'category_name', c.name,
           'supplier_name', sup.name,
           'is_low_stock', p.stock_qty <= greatest(p.min_stock, coalesce(s.low_stock_threshold,5))
         ) as product,
         (select coalesce(jsonb_agg(to_jsonb(v) order by v.created_at), '[]'::jsonb)
            from product_variants v where v.product_id = p.id) as variants,
         (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from (
            select d.name, d.key, d.field_type, d.options, av.value
              from product_attribute_values av
              join custom_attribute_definitions d on d.id = av.attribute_id
             where av.product_id = p.id and d.is_active
             order by d.display_order, d.name) a) as attributes,
         (select coalesce(jsonb_agg(to_jsonb(mv)), '[]'::jsonb) from (
            select mv.id, mv.movement_type, mv.quantity_change, mv.previous_qty, mv.new_qty,
                   mv.reference_type, mv.reference_id, mv.reason, mv.note, mv.created_at
              from stock_movements mv
             where mv.product_id = p.id and mv.variant_id is null
             order by mv.created_at desc limit 20) mv) as movements
        from products p
        left join categories c on c.id = p.category_id
        left join suppliers sup on sup.id = p.supplier_id
        cross join workspace_settings s
       where s.workspace_id = p.workspace_id and p.id = $1 and p.workspace_id = $2`,
      [req.params.pid, req.params.id]
    );
    const d = rows[0];
    if (!d) throw notFound("Product not found");
    return { product: d.product, variants: d.variants, attributes: d.attributes, movements: d.movements };
  }),

  // ---------------- SKU suggestion ----------------
  route("POST", "/workspaces/:id/sku", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    return withTx({ userId: req.userId!, workspaceId: req.params.id }, async (tx) => {
      const { rows } = await tx.query(`select generate_sku($1) as sku`, [req.params.id]);
      return { sku: rows[0].sku };
    });
  }),

  // ---------------- create product ----------------
  route("POST", "/workspaces/:id/products", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    const b = body(req, (v) => {
      if (!isRecord(v)) return null;
      const name = str(v.name, 120);
      if (!name) return null;
      const selling = intOrNull(v.selling_price);
      const purchase = intOrNull(v.purchase_price) ?? 0;
      if (selling === null || selling < 0 || purchase < 0) return null;
      return {
        name,
        sku: strOrNull(v.sku, 60),
        brand: strOrNull(v.brand, 80),
        category_id: uuidOrNull(v.category_id),
        supplier_id: uuidOrNull(v.supplier_id),
        description: strOrNull(v.description, 1000),
        barcode: strOrNull(v.barcode, 60),
        image_url: strOrNull(v.image_url, 500),
        selling_price: selling,
        purchase_price: purchase,
        stock_qty: intOrNull(v.stock_qty) ?? 0,
        min_stock: intOrNull(v.min_stock) ?? 0,
        attributes: Array.isArray(v.attributes) ? v.attributes : null,
        variants: Array.isArray(v.variants) ? v.variants : null,
      };
    }, "Product name and selling price are required");

    return withTx({ userId: req.userId!, workspaceId: req.params.id }, async (tx) => {
      // SKU: auto-generate when not supplied
      let sku = b.sku;
      if (!sku) {
        const { rows } = await tx.query(`select generate_sku($1) as sku`, [req.params.id]);
        sku = rows[0].sku;
      } else {
        const { rows: dupe } = await tx.query(
          `select 1 from products where workspace_id = $1 and sku = $2`, [req.params.id, sku]
        );
        if (dupe.length) throw conflict("This SKU is already used by another product");
      }

      try {
        const { rows } = await tx.query(`select create_product($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) as id`, [
          req.params.id, sku, b.name, b.brand, b.category_id, b.supplier_id,
          b.description, b.barcode, b.image_url, b.selling_price, b.purchase_price,
          b.stock_qty, b.min_stock,
          b.attributes ? JSON.stringify(b.attributes) : null,
          b.variants ? JSON.stringify(b.variants) : null,
        ]);
        return { product_id: rows[0].id };
      } catch (err) {
        const pg = pgError(err);
        if (pg?.code === DUPLICATE_SKU) throw conflict("This SKU is already used by another product");
        if (pg?.code === "23503" && pg.message.includes("category")) throw badRequest("Selected category no longer exists");
        if (pg?.code === "23503" && pg.message.includes("supplier")) throw badRequest("Selected supplier no longer exists");
        throw err;
      }
    });
  }),

  // ---------------- update product ----------------
  route("PATCH", "/workspaces/:id/products/:pid", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    const b = body(req, (v) => {
      if (!isRecord(v)) return null;
      const out: Record<string, unknown> = {};
      if (v.name !== undefined) { const n = str(v.name, 120); if (!n) return null; out.name = n; }
      if (v.brand !== undefined) out.brand = strOrNull(v.brand, 80);
      if (v.category_id !== undefined) out.category_id = uuidOrNull(v.category_id);
      if (v.supplier_id !== undefined) out.supplier_id = uuidOrNull(v.supplier_id);
      if (v.description !== undefined) out.description = strOrNull(v.description, 1000);
      if (v.barcode !== undefined) out.barcode = strOrNull(v.barcode, 60);
      if (v.image_url !== undefined) out.image_url = strOrNull(v.image_url, 500);
      if (v.selling_price !== undefined) { const n = intOrNull(v.selling_price); if (n === null || n < 0) return null; out.selling_price = n; }
      if (v.purchase_price !== undefined) { const n = intOrNull(v.purchase_price); if (n === null || n < 0) return null; out.purchase_price = n; }
      if (v.min_stock !== undefined) { const n = intOrNull(v.min_stock); if (n === null || n < 0) return null; out.min_stock = n; }
      if (v.sku !== undefined) { const s = strOrNull(v.sku, 60); if (!s) return null; out.sku = s; }
      if (v.status !== undefined) {
        const s = v.status === "archived" ? "archived" : v.status === "active" ? "active" : null;
        if (!s) return null;
        out.status = s;
      }
      if (Array.isArray(v.attributes)) out.__attributes = v.attributes;
      return Object.keys(out).length ? out : null;
    }, "Nothing to update");

    return withTx({ userId: req.userId!, workspaceId: req.params.id }, async (tx) => {
      const { rows: current } = await tx.query(
        `select id, sku, status from products where id = $1 and workspace_id = $2 for update`,
        [req.params.pid, req.params.id]
      );
      if (!current[0]) throw notFound("Product not found");

      const { __attributes: attributes, ...fields } = b;
      const keys = Object.keys(fields);
      if (keys.length) {
        const sets = keys.map((k, i) => `${k} = $${i + 3}`).join(", ");
        try {
          await tx.query(
            `update products set ${sets} where id = $1 and workspace_id = $2`,
            [req.params.pid, req.params.id, ...keys.map((k) => fields[k])]
          );
        } catch (err) {
          const pg = pgError(err);
          if (pg?.code === DUPLICATE_SKU) throw conflict("This SKU is already used by another product");
          throw err;
        }
      }

      // replace custom attribute values if provided
      if (Array.isArray(attributes)) {
        await tx.query(`delete from product_attribute_values where product_id = $1`, [req.params.pid]);
        for (const a of attributes) {
          if (!isRecord(a)) continue;
          const attribute_id = uuidOrNull(a.attribute_id);
          if (!attribute_id) continue;
          await tx.query(
            `insert into product_attribute_values (workspace_id, product_id, attribute_id, value)
             values ($1, $2, $3, $4::jsonb)
             on conflict (product_id, attribute_id) do update set value = excluded.value`,
            [req.params.id, req.params.pid, attribute_id, JSON.stringify(a.value ?? null)]
          );
        }
      }

      const { rows: updated } = await tx.query(`select * from products where id = $1`, [req.params.pid]);
      return { product: updated[0] };
    });
  }),

  // ---------------- archive product ----------------
  route("POST", "/workspaces/:id/products/:pid/archive", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    return withTx({ userId: req.userId!, workspaceId: req.params.id }, async (tx) => {
      const { rows } = await tx.query(
        `update products set status = 'archived' where id = $1 and workspace_id = $2 returning id`,
        [req.params.pid, req.params.id]
      );
      if (!rows[0]) throw notFound("Product not found");
      return { ok: true };
    });
  }),

  // ---------------- categories ----------------
  route("GET", "/workspaces/:id/categories", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    const rows = await scopedQuery(
      { userId: req.userId!, workspaceId: req.params.id },
      `select c.*, (select count(*)::int from products p where p.category_id = c.id and p.status = 'active') as product_count
         from categories c
        where c.workspace_id = $1
        order by lower(c.name)`,
      [req.params.id]
    );
    return { categories: rows };
  }),

  route("POST", "/workspaces/:id/categories", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    const b = body(req, (v) => {
      if (!isRecord(v)) return null;
      const name = str(v.name, 60);
      if (!name) return null;
      return { name, description: strOrNull(v.description, 300) };
    }, "Category name is required");

    return withTx({ userId: req.userId!, workspaceId: req.params.id }, async (tx) => {
      try {
        const { rows } = await tx.query(
          `insert into categories (workspace_id, name, description) values ($1, $2, $3) returning *`,
          [req.params.id, b.name, b.description]
        );
        return { category: rows[0] };
      } catch (err) {
        const pg = pgError(err);
        if (pg?.code === DUPLICATE_SKU) throw conflict("A category with this name already exists");
        throw err;
      }
    });
  }),

  route("PATCH", "/workspaces/:id/categories/:cid", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    const b = body(req, (v) => {
      if (!isRecord(v)) return null;
      const out: Record<string, unknown> = {};
      if (v.name !== undefined) { const n = str(v.name, 60); if (!n) return null; out.name = n; }
      if (v.description !== undefined) out.description = strOrNull(v.description, 300);
      return Object.keys(out).length ? out : null;
    }, "Nothing to update");

    return withTx({ userId: req.userId!, workspaceId: req.params.id }, async (tx) => {
      try {
        const { rows } = await tx.query(
          `update categories set ${Object.keys(b).map((k, i) => `${k} = $${i + 3}`).join(", ")}
            where id = $1 and workspace_id = $2 returning *`,
          [req.params.cid, req.params.id, ...Object.keys(b).map((k) => b[k])]
        );
        if (!rows[0]) throw notFound("Category not found");
        return { category: rows[0] };
      } catch (err) {
        const pg = pgError(err);
        if (pg?.code === DUPLICATE_SKU) throw conflict("A category with this name already exists");
        throw err;
      }
    });
  }),

  route("DELETE", "/workspaces/:id/categories/:cid", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    return withTx({ userId: req.userId!, workspaceId: req.params.id }, async (tx) => {
      const { rows } = await tx.query(
        `delete from categories where id = $1 and workspace_id = $2 returning id`,
        [req.params.cid, req.params.id]
      );
      if (!rows[0]) throw notFound("Category not found");
      return { ok: true };
    });
  }),

  // ---------------- custom attribute definitions ----------------
  route("GET", "/workspaces/:id/attributes", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    const rows = await scopedQuery(
      { userId: req.userId!, workspaceId: req.params.id },
      `select * from custom_attribute_definitions where workspace_id = $1 order by display_order, created_at`,
      [req.params.id]
    );
    return { attributes: rows };
  }),

  route("POST", "/workspaces/:id/attributes", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    const b = body(req, (v) => {
      if (!isRecord(v)) return null;
      const name = str(v.name, 60);
      if (!name) return null;
      const field_type = ["text","number","dropdown","boolean"].includes(String(v.field_type)) ? String(v.field_type) : null;
      if (!field_type) return null;
      const options = Array.isArray(v.options)
        ? v.options.filter((o): o is string => typeof o === "string" && o.trim() !== "").map((o) => o.trim()).slice(0, 30)
        : [];
      if (field_type === "dropdown" && options.length === 0) return null;
      const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
      if (!key) return null;
      return {
        key,
        name,
        field_type,
        options,
        required: bool(v.required) ?? false,
        display_order: intOrNull(v.display_order) ?? 0,
      };
    }, "Attribute name and a valid type are required (dropdowns need options)");

    return withTx({ userId: req.userId!, workspaceId: req.params.id }, async (tx) => {
      try {
        const { rows } = await tx.query(
          `insert into custom_attribute_definitions
             (workspace_id, key, name, field_type, options, required, display_order)
           values ($1, $2, $3, $4::field_type, $5, $6, $7) returning *`,
          [req.params.id, b.key, b.name, b.field_type, b.options, b.required, b.display_order]
        );
        return { attribute: rows[0] };
      } catch (err) {
        const pg = pgError(err);
        if (pg?.code === DUPLICATE_SKU) throw conflict("An attribute with this name already exists");
        throw err;
      }
    });
  }),

  route("PATCH", "/workspaces/:id/attributes/:aid", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    const b = body(req, (v) => {
      if (!isRecord(v)) return null;
      const out: Record<string, unknown> = {};
      if (v.name !== undefined) { const n = str(v.name, 60); if (!n) return null; out.name = n; }
      if (v.required !== undefined) { const x = bool(v.required); if (x === null) return null; out.required = x; }
      if (v.is_active !== undefined) { const x = bool(v.is_active); if (x === null) return null; out.is_active = x; }
      if (v.display_order !== undefined) { const n = intOrNull(v.display_order); if (n === null) return null; out.display_order = n; }
      if (v.options !== undefined) {
        const options = Array.isArray(v.options)
          ? v.options.filter((o): o is string => typeof o === "string" && o.trim() !== "").map((o) => o.trim()).slice(0, 30)
          : null;
        if (options === null) return null;
        out.options = options;
      }
      return Object.keys(out).length ? out : null;
    }, "Nothing to update");

    return withTx({ userId: req.userId!, workspaceId: req.params.id }, async (tx) => {
      const keys = Object.keys(b);
      const { rows } = await tx.query(
        `update custom_attribute_definitions set ${keys.map((k, i) => `${k} = $${i + 3}`).join(", ")}
          where id = $1 and workspace_id = $2 returning *`,
        [req.params.aid, req.params.id, ...keys.map((k) => b[k])]
      );
      if (!rows[0]) throw notFound("Attribute not found");
      return { attribute: rows[0] };
    });
  }),

  route("DELETE", "/workspaces/:id/attributes/:aid", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    return withTx({ userId: req.userId!, workspaceId: req.params.id }, async (tx) => {
      const { rows } = await tx.query(
        `delete from custom_attribute_definitions where id = $1 and workspace_id = $2 returning id`,
        [req.params.aid, req.params.id]
      );
      if (!rows[0]) throw notFound("Attribute not found");
      return { ok: true };
    });
  }),

  // ---------------- stock adjustment ----------------
  route("POST", "/workspaces/:id/adjustments", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    const b = body(req, (v) => {
      if (!isRecord(v)) return null;
      const product_id = uuidOrNull(v.product_id);
      const change = intOrNull(v.quantity_change);
      const reason = ["damage","missing","correction","other"].includes(String(v.reason)) ? String(v.reason) : null;
      if (!product_id || change === null || change === 0 || !reason) return null;
      return {
        product_id,
        variant_id: uuidOrNull(v.variant_id),
        change,
        reason,
        note: strOrNull(v.note, 300),
      };
    }, "A product, a non-zero quantity and a reason are required");

    return withTx({ userId: req.userId!, workspaceId: req.params.id }, async (tx) => {
      const { rows: settings } = await tx.query(
        `select allow_negative_stock from workspace_settings where workspace_id = $1`, [req.params.id]
      );
      const { rows: product } = await tx.query(
        `select name, stock_qty from products where id = $1 and workspace_id = $2 for update`,
        [b.product_id, req.params.id]
      );
      if (!product[0]) throw notFound("Product not found");

      try {
        const { rows } = await tx.query(`select adjust_stock($1,$2,$3,$4,$5,$6) as new_qty`, [
          req.params.id, b.product_id, b.variant_id, b.change, b.reason, b.note,
        ]);
        return { new_qty: rows[0].new_qty, previous_qty: product[0].stock_qty };
      } catch (err) {
        const msg = String((err as Error).message);
        if (msg.includes("INSUFFICIENT_STOCK")) throw badRequest("Adjustment would make stock negative");
        throw err;
      }
    });
  }),
];
