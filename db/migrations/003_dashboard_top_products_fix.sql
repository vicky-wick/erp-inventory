-- Fix nested aggregate in top_products
create or replace function dashboard_stats(
  p_workspace_id uuid,
  p_days integer default 7
) returns jsonb as $$
declare
  v_result jsonb;
  v_since timestamptz := now() - make_interval(days => greatest(p_days, 0));
begin
  select jsonb_build_object(
    'total_products', (select count(*) from products where workspace_id = p_workspace_id and status = 'active'),
    'low_stock_count', (select count(*) from products p
                         where p.workspace_id = p_workspace_id and p.status = 'active'
                           and p.stock_qty <= greatest(p.min_stock,
                                coalesce((select low_stock_threshold from workspace_settings s
                                          where s.workspace_id = p_workspace_id), 5))),
    'inventory_value', (select coalesce(sum(stock_qty * purchase_price), 0) from products
                         where workspace_id = p_workspace_id and status = 'active'),
    'today_sales_total', (select coalesce(sum(total), 0) from sales
                           where workspace_id = p_workspace_id
                             and status in ('completed','partially_returned')
                             and created_at >= date_trunc('day', now())),
    'today_sales_count', (select count(*) from sales
                           where workspace_id = p_workspace_id
                             and status in ('completed','partially_returned')
                             and created_at >= date_trunc('day', now())),
    'period_sales_total', (select coalesce(sum(total), 0) from sales
                            where workspace_id = p_workspace_id
                              and status in ('completed','partially_returned')
                              and created_at >= v_since),
    'period_sales_count', (select count(*) from sales
                            where workspace_id = p_workspace_id
                              and status in ('completed','partially_returned')
                              and created_at >= v_since),
    'daily_sales', (
      select coalesce(jsonb_agg(
               jsonb_build_object('day', g.d, 'total', coalesce(agg.total, 0), 'count', coalesce(agg.cnt, 0))
               order by g.d), '[]')
      from generate_series(date_trunc('day', v_since), date_trunc('day', now()), interval '1 day') g(d)
      left join (
        select date_trunc('day', created_at) as day,
               sum(total)::bigint as total,
               count(*)::int as cnt
          from sales
         where workspace_id = p_workspace_id
           and status in ('completed','partially_returned')
           and created_at >= v_since
         group by 1
      ) agg on agg.day = g.d
    ),
    'top_products', (
      select coalesce(jsonb_agg(
               jsonb_build_object('product_id', t.product_id, 'name', t.name,
                                  'quantity', t.qty, 'revenue', t.revenue)
               order by t.qty desc), '[]')
      from (
        select si.product_id, si.product_name as name,
               sum(si.quantity)::int as qty,
               sum(si.line_total)::bigint as revenue
          from sale_items si
          join sales s on s.id = si.sale_id
         where si.workspace_id = p_workspace_id
           and s.status in ('completed','partially_returned')
           and s.created_at >= v_since
         group by si.product_id, si.product_name
         order by qty desc
         limit 5
      ) t
    )
  ) into v_result;

  return v_result;
end;
$$ language plpgsql stable;


