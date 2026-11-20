import {
  route, body, isRecord, str, strOrNull, intOrNull, uuidOrNull,
  ApiRequest, unauthorized, notFound, badRequest, conflict,
} from "../router.js";
import { withTx, scopedQuery, pgError } from "../db.js";
import { requireMembership, ownedRow } from "../access.js";

// ------------------------------------------------------------------ SALES

type ItemInput = {
  product_id: string; variant_id: string | null;
  product_name: string; variant_name: string | null;
  sku: string; quantity: number; unit_price: number;
};

function parseSaleItems(v: unknown): ItemInput[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const items: ItemInput[] = [];
  for (const raw of v) {
    if (!isRecord(raw)) return null;
    const product_id = uuidOrNull(raw.product_id);
    const quantity = intOrNull(raw.quantity);
    const unit_price = intOrNull(raw.unit_price);
    const product_name = strOrNull(raw.product_name, 120);
    const sku = strOrNull(raw.sku, 60);
    if (!product_id || !quantity || quantity <= 0 || quantity > 10000 || unit_price === null || unit_price < 0 || !product_name || !sku) return null;
    items.push({
      product_id,
      variant_id: uuidOrNull(raw.variant_id),
      product_name,
      variant_name: strOrNull(raw.variant_name, 80),
      sku,
      quantity,
      unit_price,
    });
  }
  return items;
}

export default [
  // ---------------- create sale (atomic via DB function) ----------------
  route("POST", "/workspaces/:id/sales", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    const b = body(req, (v) => {
      if (!isRecord(v)) return null;
      const items = parseSaleItems(v.items);
      if (!items) return null;
      // Discount can be typed as a flat amount or as a percentage. `discount`
      // stays the absolute paise amount (authoritative in the DB); the raw
      // input is kept as type + value (paise, or basis points for percent).
      const discountType = v.discount_type === "percent" ? "percent" : "amount";
      const discountValue =
        intOrNull(v.discount_value) ?? (discountType === "amount" ? (intOrNull(v.discount) ?? 0) : 0);
      if (discountValue < 0) return null;
      if (discountType === "percent" && discountValue > 10000) return null;
      const discount = discountType === "amount" ? discountValue : 0;
      const method = ["cash","upi","card","other"].includes(String(v.payment_method)) ? String(v.payment_method) : null;
      if (!method) return null;
      return {
        items,
        discount,
        discount_type: discountType,
        discount_value: discountValue,
        payment_method: method,
        customer_name: strOrNull(v.customer_name, 80),
        customer_phone: strOrNull(v.customer_phone, 20),
        notes: strOrNull(v.notes, 300),
      };
    }, "Add at least one product with a valid quantity and price");

    return withTx({ userId: req.userId!, workspaceId: req.params.id }, async (tx) => {
      const { rows: ws } = await tx.query(
        `select w.invoice_prefix, s.allow_negative_stock, next_sequence($1,'sale') as seq
           from workspaces w cross join workspace_settings s
          where w.id = $1 and s.workspace_id = $1`,
        [req.params.id]
      );
      if (!ws[0]) throw notFound("Workspace not found");

      // Verify each product belongs to this workspace before touching stock
      for (const item of b.items) {
        const { rows: p } = await tx.query(
          `select 1 from products where id = $1 and workspace_id = $2`,
          [item.product_id, req.params.id]
        );
        if (!p.length) throw badRequest("One of the products is no longer available");
        if (item.variant_id) {
          const { rows: v } = await tx.query(
            `select 1 from product_variants where id = $1 and product_id = $2 and workspace_id = $3`,
            [item.variant_id, item.product_id, req.params.id]
          );
          if (!v.length) throw badRequest("One of the product variants is no longer available");
        }
      }

      try {
        const { rows } = await tx.query(
          `select record_sale($1,$2,$3,$4::payment_method,$5,$6,$7,$8,$9,$10,$11,$12) as result`,
          [
            req.params.id,
            JSON.stringify(b.items),
            b.discount,
            b.payment_method,
            b.customer_name, b.customer_phone, b.notes,
            ws[0].allow_negative_stock,
            ws[0].invoice_prefix,
            ws[0].seq,
            b.discount_type,
            b.discount_value,
          ]
        );
        return { sale: rows[0].result };
      } catch (err) {
        const msg = String((err as Error).message);
        if (msg.includes("INSUFFICIENT_STOCK")) throw badRequest("Not enough stock for one of the products. Please check quantities.");
        if (msg.includes("DISCOUNT_EXCEEDS_SUBTOTAL")) throw badRequest("Discount cannot be more than the sale total");
        if (msg.includes("INVALID_DISCOUNT")) throw badRequest("Discount percentage must be between 0 and 100");
        throw err;
      }
    });
  }),

  // ---------------- sales list ----------------
  route("GET", "/workspaces/:id/sales", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    const page = Math.max(1, intOrNull(req.query.get("page")) ?? 1);
    const perPage = Math.min(100, Math.max(10, intOrNull(req.query.get("per_page")) ?? 25));
    const search = req.query.get("search")?.trim() ?? "";
    const days = intOrNull(req.query.get("days"));

    const conditions = ["workspace_id = $1"];
    const params: unknown[] = [req.params.id];
    let pn = 1;
    if (search) {
      pn++;
      conditions.push(`(sale_no ilike $${pn} or coalesce(customer_name,'') ilike $${pn} or coalesce(customer_phone,'') ilike $${pn})`);
      params.push(`%${search}%`);
    }
    if (days && days > 0) {
      pn++;
      conditions.push(`created_at >= now() - make_interval(days => $${pn})`);
      params.push(days);
    }

    const rows = await scopedQuery(
      { userId: req.userId!, workspaceId: req.params.id },
      `select id, sale_no, customer_name, customer_phone, items_count, total, discount,
              payment_method, payment_status, status, created_at
         from sales
        where ${conditions.join(" and ")}
        order by created_at desc
        limit ${perPage + 1} offset ${(page - 1) * perPage}`,
      params
    );
    const hasMore = rows.length > perPage;
    return { sales: rows.slice(0, perPage), page, has_more: hasMore };
  }),

  // ---------------- sale detail ----------------
  route("GET", "/workspaces/:id/sales/:saleId", async (req: ApiRequest) => {
    const sale = await ownedRow<Record<string, unknown>>(req, req.params.id, "sales", req.params.saleId);
    const items = await scopedQuery(
      { userId: req.userId!, workspaceId: req.params.id },
      `select si.*, p.image_url from sale_items si left join products p on p.id = si.product_id where sale_id = $1 order by si.id`,
      [req.params.saleId]
    );
    return { sale, items };
  }),

  // ---------------- return sale (full or partial) ----------------
  route("POST", "/workspaces/:id/sales/:saleId/return", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    const b = body(req, (v) => {
      if (!isRecord(v)) return null;
      const items = Array.isArray(v.items) ? v.items : null;
      if (!items || items.length === 0) return null;
      const parsed = [];
      for (const raw of items) {
        if (!isRecord(raw)) return null;
        const item_id = uuidOrNull(raw.item_id);
        if (!item_id) return null;
        const quantity = raw.quantity === undefined || raw.quantity === null ? null : intOrNull(raw.quantity);
        if (quantity !== null && (quantity <= 0)) return null;
        parsed.push({ item_id, quantity });
      }
      return { items: parsed, reason: strOrNull(v.reason, 200) };
    }, "Select items to return");

    return withTx({ userId: req.userId!, workspaceId: req.params.id }, async (tx) => {
      try {
        const { rows } = await tx.query(`select return_sale($1,$2,$3,$4) as result`, [
          req.params.id, req.params.saleId,
          JSON.stringify(b.items), b.reason,
        ]);
        return { return: rows[0].result };
      } catch (err) {
        const msg = String((err as Error).message);
        if (msg.includes("INVALID_RETURN_QTY")) throw badRequest("Return quantity is more than what remains on this item");
        if (msg.includes("SALE_ALREADY_RETURNED")) throw badRequest("This sale has already been fully returned");
        if (msg.includes("SALE_CANCELLED")) throw badRequest("This sale was cancelled");
        throw err;
      }
    });
  }),

  // ------------------------------------------------------------------ PURCHASES

  // ---------------- create purchase (draft) ----------------
  route("POST", "/workspaces/:id/purchases", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    const b = body(req, (v) => {
      if (!isRecord(v)) return null;
      const items = Array.isArray(v.items) ? v.items : null;
      if (!items || items.length === 0) return null;
      const parsed = [];
      for (const raw of items) {
        if (!isRecord(raw)) return null;
        const product_id = uuidOrNull(raw.product_id);
        const quantity = intOrNull(raw.quantity);
        const unit_cost = intOrNull(raw.unit_cost);
        const product_name = strOrNull(raw.product_name, 120);
        const sku = strOrNull(raw.sku, 60);
        if (!product_id || !quantity || quantity <= 0 || unit_cost === null || unit_cost < 0 || !product_name || !sku) return null;
        parsed.push({
          product_id,
          variant_id: uuidOrNull(raw.variant_id),
          product_name, sku, quantity, unit_cost,
        });
      }
      return {
        items: parsed,
        supplier_id: uuidOrNull(v.supplier_id),
        invoice_no: strOrNull(v.invoice_no, 60),
        purchase_date: strOrNull(v.purchase_date, 10),
        notes: strOrNull(v.notes, 300),
        receive_now: v.receive_now === true,
      };
    }, "Add at least one product with quantity and cost");

    return withTx({ userId: req.userId!, workspaceId: req.params.id }, async (tx) => {
      const { rows: ws } = await tx.query(
        `select invoice_prefix, next_sequence($1,'purchase') as seq from workspaces cross join workspace_settings s
          where id = $1 and s.workspace_id = $1`, [req.params.id]
      );
      if (!ws[0]) throw notFound();
      const purchase_no = `${ws[0].invoice_prefix}-P-${String(ws[0].seq).padStart(5, "0")}`;

      // verify products belong to workspace
      for (const item of b.items) {
        const { rows: p } = await tx.query(
          `select 1 from products where id = $1 and workspace_id = $2`, [item.product_id, req.params.id]
        );
        if (!p.length) throw badRequest("One of the products is no longer available");
      }

      const dateMatch = b.purchase_date ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(b.purchase_date) : null;
      const purchaseDate = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : null;

      const total = b.items.reduce((sum, it) => sum + it.quantity * it.unit_cost, 0);
      const { rows } = await tx.query(
        `insert into purchases (workspace_id, purchase_no, supplier_id, invoice_no, purchase_date,
                                items_count, total, status, notes, created_by)
         values ($1, $2, $3, $4, coalesce($5::date, current_date), $6, $7, 'draft', $8, $9)
         returning id, purchase_no`,
        [req.params.id, purchase_no, b.supplier_id, b.invoice_no, purchaseDate,
         b.items.length, total, b.notes, req.userId]
      );
      const purchaseId = rows[0].id;

      for (const it of b.items) {
        await tx.query(
          `insert into purchase_items (purchase_id, workspace_id, product_id, variant_id,
                                       product_name, sku, quantity, unit_cost, line_total)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [purchaseId, req.params.id, it.product_id, it.variant_id,
           it.product_name, it.sku, it.quantity, it.unit_cost, it.quantity * it.unit_cost]
        );
      }

      if (b.receive_now) {
        await tx.query(`select receive_purchase($1,$2)`, [req.params.id, purchaseId]);
      }

      return { purchase_id: purchaseId, purchase_no: rows[0].purchase_no, received: b.receive_now };
    });
  }),

  // ---------------- purchases list ----------------
  route("GET", "/workspaces/:id/purchases", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    const page = Math.max(1, intOrNull(req.query.get("page")) ?? 1);
    const perPage = Math.min(100, Math.max(10, intOrNull(req.query.get("per_page")) ?? 25));
    const status = req.query.get("status");
    const params: unknown[] = [req.params.id];
    let cond = "p.workspace_id = $1";
    if (status && ["draft","received","cancelled"].includes(status)) {
      params.push(status);
      cond += ` and p.status = $2`;
    }
    const rows = await scopedQuery(
      { userId: req.userId!, workspaceId: req.params.id },
      `select p.*, s.name as supplier_name
         from purchases p left join suppliers s on s.id = p.supplier_id
        where ${cond}
        order by p.created_at desc
        limit ${perPage + 1} offset ${(page - 1) * perPage}`,
      params
    );
    const hasMore = rows.length > perPage;
    return { purchases: rows.slice(0, perPage), page, has_more: hasMore };
  }),

  // ---------------- purchase detail ----------------
  route("GET", "/workspaces/:id/purchases/:purchaseId", async (req: ApiRequest) => {
    const purchase = await ownedRow<Record<string, unknown>>(req, req.params.id, "purchases", req.params.purchaseId);
    const items = await scopedQuery(
      { userId: req.userId!, workspaceId: req.params.id },
      `select * from purchase_items where purchase_id = $1`,
      [req.params.purchaseId]
    );
    return { purchase, items };
  }),

  // ---------------- receive / cancel purchase ----------------
  route("POST", "/workspaces/:id/purchases/:purchaseId/receive", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    return withTx({ userId: req.userId!, workspaceId: req.params.id }, async (tx) => {
      try {
        await tx.query(`select receive_purchase($1,$2)`, [req.params.id, req.params.purchaseId]);
        return { ok: true };
      } catch (err) {
        const msg = String((err as Error).message);
        if (msg.includes("PURCHASE_ALREADY_RECEIVED")) throw badRequest("This purchase was already received");
        if (msg.includes("PURCHASE_CANCELLED")) throw badRequest("This purchase was cancelled");
        throw err;
      }
    });
  }),

  route("POST", "/workspaces/:id/purchases/:purchaseId/cancel", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    const b = body(req, (v) => {
      if (!isRecord(v)) return { reason: null };
      return { reason: strOrNull(v.reason, 200) };
    }, "Invalid request");

    return withTx({ userId: req.userId!, workspaceId: req.params.id }, async (tx) => {
      try {
        await tx.query(`select reverse_purchase($1,$2,$3)`, [req.params.id, req.params.purchaseId, b.reason]);
        return { ok: true };
      } catch (err) {
        const msg = String((err as Error).message);
        if (msg.includes("PURCHASE_ALREADY_CANCELLED")) throw badRequest("This purchase was already cancelled");
        throw err;
      }
    });
  }),

  // ------------------------------------------------------------------ SUPPLIERS

  route("GET", "/workspaces/:id/suppliers", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    const rows = await scopedQuery(
      { userId: req.userId!, workspaceId: req.params.id },
      `select s.*,
              (select count(*)::int from products p where p.supplier_id = s.id and p.status = 'active') as product_count,
              (select count(*)::int from purchases pu where pu.supplier_id = s.id) as purchase_count
         from suppliers s
        where s.workspace_id = $1
        order by lower(s.name)`,
      [req.params.id]
    );
    return { suppliers: rows };
  }),

  route("POST", "/workspaces/:id/suppliers", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    const b = body(req, (v) => {
      if (!isRecord(v)) return null;
      const name = str(v.name, 80);
      if (!name) return null;
      return {
        name,
        phone: strOrNull(v.phone, 20),
        email: strOrNull(v.email, 200),
        address: strOrNull(v.address, 300),
        notes: strOrNull(v.notes, 300),
      };
    }, "Supplier name is required");

    return withTx({ userId: req.userId!, workspaceId: req.params.id }, async (tx) => {
      const { rows } = await tx.query(
        `insert into suppliers (workspace_id, name, phone, email, address, notes)
         values ($1, $2, $3, $4, $5, $6) returning *`,
        [req.params.id, b.name, b.phone, b.email, b.address, b.notes]
      );
      return { supplier: rows[0] };
    });
  }),

  route("GET", "/workspaces/:id/suppliers/:supplierId", async (req: ApiRequest) => {
    const supplier = await ownedRow<Record<string, unknown>>(req, req.params.id, "suppliers", req.params.supplierId);
    const products = await scopedQuery(
      { userId: req.userId!, workspaceId: req.params.id },
      `select id, name, sku, stock_qty, selling_price, image_url from products
        where supplier_id = $1 and status = 'active' order by lower(name) limit 50`,
      [req.params.supplierId]
    );
    const purchases = await scopedQuery(
      { userId: req.userId!, workspaceId: req.params.id },
      `select id, purchase_no, total, status, purchase_date from purchases
        where supplier_id = $1 order by created_at desc limit 20`,
      [req.params.supplierId]
    );
    return { supplier, products, purchases };
  }),

  route("PATCH", "/workspaces/:id/suppliers/:supplierId", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    const b = body(req, (v) => {
      if (!isRecord(v)) return null;
      const out: Record<string, unknown> = {};
      if (v.name !== undefined) { const n = str(v.name, 80); if (!n) return null; out.name = n; }
      if (v.phone !== undefined) out.phone = strOrNull(v.phone, 20);
      if (v.email !== undefined) out.email = strOrNull(v.email, 200);
      if (v.address !== undefined) out.address = strOrNull(v.address, 300);
      if (v.notes !== undefined) out.notes = strOrNull(v.notes, 300);
      return Object.keys(out).length ? out : null;
    }, "Nothing to update");

    return withTx({ userId: req.userId!, workspaceId: req.params.id }, async (tx) => {
      const keys = Object.keys(b);
      const { rows } = await tx.query(
        `update suppliers set ${keys.map((k, i) => `${k} = $${i + 3}`).join(", ")}
          where id = $1 and workspace_id = $2 returning *`,
        [req.params.supplierId, req.params.id, ...keys.map((k) => b[k])]
      );
      if (!rows[0]) throw notFound("Supplier not found");
      return { supplier: rows[0] };
    });
  }),
];
