import { route, intOrNull, ApiRequest, unauthorized } from "../router";
import { withTx, scopedQuery } from "../db";
import { requireMembership } from "../access";

export default [
  // ---------------- dashboard stats ----------------
  route("GET", "/workspaces/:id/dashboard", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    const days = Math.min(90, Math.max(1, intOrNull(req.query.get("days")) ?? 7));
    const rows = await scopedQuery<{ stats: unknown; recent_sales: unknown[]; recent_purchases: unknown[]; low_stock: unknown[] }>(
      { userId: req.userId!, workspaceId: req.params.id },
      `select
         (select dashboard_stats($1, $2)) as stats,
         (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
            select id, sale_no, customer_name, total, payment_method, status, created_at
              from sales where workspace_id = $1
             order by created_at desc limit 5) x) as recent_sales,
         (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
            select id, purchase_no, total, status, purchase_date, supplier_id
              from purchases where workspace_id = $1
             order by created_at desc limit 5) x) as recent_purchases,
         (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
            select p.id, p.name, p.sku, p.image_url, p.stock_qty, p.min_stock,
                   greatest(p.min_stock, coalesce(s.low_stock_threshold,5)) as threshold
              from products p cross join workspace_settings s
             where s.workspace_id = p.workspace_id and p.workspace_id = $1
               and p.status = 'active'
               and p.stock_qty <= greatest(p.min_stock, coalesce(s.low_stock_threshold,5))
             order by p.stock_qty asc limit 8) x) as low_stock`,
      [req.params.id, days]
    );
    return {
      stats: rows[0].stats,
      recent_sales: rows[0].recent_sales,
      recent_purchases: rows[0].recent_purchases,
      low_stock: rows[0].low_stock,
    };
  }),

  // ---------------- reports ----------------
  route("GET", "/workspaces/:id/reports/sales", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    const days = Math.min(365, Math.max(1, intOrNull(req.query.get("days")) ?? 30));
    const rs = await scopedQuery(
      { userId: req.userId!, workspaceId: req.params.id },
      `with sm as (
         select count(*)::int as sales_count, coalesce(sum(total),0)::bigint as revenue,
                coalesce(sum(discount),0)::bigint as discount, coalesce(avg(total),0)::bigint as avg_sale
           from sales
          where workspace_id = $1 and status in ('completed','partially_returned')
            and created_at >= now() - make_interval(days => $2)
       ), bp as (
         select coalesce(jsonb_agg(to_jsonb(x) order by x.total desc), '[]'::jsonb) as v from (
           select payment_method, count(*)::int as count, coalesce(sum(total),0)::bigint as total
             from sales
            where workspace_id = $1 and status in ('completed','partially_returned')
              and created_at >= now() - make_interval(days => $2)
            group by payment_method) x
       ), rw as (
         select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as v from (
           select sale_no, created_at, customer_name, payment_method, status,
                  items_count, subtotal, discount, total
             from sales
            where workspace_id = $1 and status in ('completed','partially_returned')
              and created_at >= now() - make_interval(days => $2)
            order by created_at desc
            limit 500) x
       )
       select sm.*, bp.v as by_payment, rw.v as rows from sm, bp, rw`,
      [req.params.id, days]
    );
    const r = rs[0];
    return { summary: { sales_count: r.sales_count, revenue: r.revenue, discount: r.discount, avg_sale: r.avg_sale }, by_payment_method: r.by_payment, rows: r.rows };
  }),

  route("GET", "/workspaces/:id/reports/inventory", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    const rs = await scopedQuery(
      { userId: req.userId!, workspaceId: req.params.id },
      `with rw as (
         select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as v from (
           select p.sku, p.name, coalesce(c.name,'') as category, p.stock_qty, p.min_stock,
                  p.purchase_price, p.selling_price, (p.stock_qty * p.purchase_price)::bigint as stock_value
             from products p left join categories c on c.id = p.category_id
            where p.workspace_id = $1 and p.status = 'active'
            order by (p.stock_qty * p.purchase_price) desc
            limit 1000) x
       ), tt as (
         select count(*)::int as products, coalesce(sum(stock_qty),0)::int as units,
                coalesce(sum(stock_qty * purchase_price),0)::bigint as stock_value
           from products where workspace_id = $1 and status = 'active'
       )
       select rw.v as rows, to_jsonb(tt) as totals from rw, tt`,
      [req.params.id]
    );
    const r = rs[0];
    return { totals: r.totals, rows: r.rows };
  }),

  route("GET", "/workspaces/:id/reports/low-stock", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    const rows = await scopedQuery(
      { userId: req.userId!, workspaceId: req.params.id },
      `select p.sku, p.name, coalesce(c.name,'') as category, p.stock_qty, p.min_stock,
              greatest(p.min_stock, coalesce(s.low_stock_threshold,5)) as threshold,
              p.purchase_price
         from products p cross join workspace_settings s
         left join categories c on c.id = p.category_id
        where s.workspace_id = p.workspace_id and p.workspace_id = $1
          and p.status = 'active'
          and p.stock_qty <= greatest(p.min_stock, coalesce(s.low_stock_threshold,5))
        order by p.stock_qty asc limit 500`,
      [req.params.id]
    );
    return { rows };
  }),

  route("GET", "/workspaces/:id/reports/purchases", async (req: ApiRequest) => {
    await requireMembership(req, req.params.id);
    const days = Math.min(365, Math.max(1, intOrNull(req.query.get("days")) ?? 30));
    const rs = await scopedQuery(
      { userId: req.userId!, workspaceId: req.params.id },
      `with rw as (
         select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as v from (
           select p.purchase_no, p.purchase_date, p.status, p.total, p.invoice_no,
                  coalesce(s.name,'') as supplier, p.items_count
             from purchases p left join suppliers s on s.id = p.supplier_id
            where p.workspace_id = $1 and p.purchase_date >= (current_date - $2::int)
            order by p.purchase_date desc limit 500) x
       ), sm as (
         select count(*)::int as purchases, coalesce(sum(total),0)::bigint as total
           from purchases
          where workspace_id = $1 and status = 'received' and purchase_date >= (current_date - $2::int)
       )
       select rw.v as rows, to_jsonb(sm) as summary from rw, sm`,
      [req.params.id, days]
    );
    const r = rs[0];
    return { summary: r.summary, rows: r.rows };
  }),
];
