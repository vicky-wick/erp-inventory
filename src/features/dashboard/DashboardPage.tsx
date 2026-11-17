import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { get, post } from "@/lib/api";
import { useSession } from "@/providers/session";
import { formatMoney, formatDateTime } from "@/lib/format";
import { Card, CardBody, Skeleton, Badge } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { Package, ShoppingCart, AlertTriangle, Wallet, Plus, ArrowRight, TrendingUp } from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
} from "recharts";
import { useState } from "react";
import type { DashboardData } from "@/types";

const RANGES = [
  { days: 1, label: "Today" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
];

export default function DashboardPage() {
  const { workspace, modules } = useSession();
  const [range, setRange] = useState(7);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const wid = workspace?.workspace.id;
  const currency = workspace?.workspace.currency ?? "INR";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard", wid, range],
    queryFn: () => get<DashboardData>(`/workspaces/${wid}/dashboard?days=${range}`),
    enabled: !!wid,
  });

  const seedDemo = useMutation({
    mutationFn: async () => {
      const cat = await post<{ category: { id: string; name: string } }>(`/workspaces/${wid}/categories`, { name: "General" });
      await post(`/workspaces/${wid}/products`, {
        name: "Sample Product", selling_price: 29900, purchase_price: 18000,
        stock_qty: 12, min_stock: 3, category_id: cat.category.id,
      });
    },
    onSuccess: () => qc.invalidateQueries(),
  });

  if (!wid) return null;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-44" />
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-48" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;

  const s = data.stats;
  const hasSales = modules.sales;
  const totalSales = s.today_sales_count + s.period_sales_count;
  const chartData = s.daily_sales.map((d) => ({
    day: new Date(d.day).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
    total: Number(d.total) / 100,
  }));

  const kpis = [
    ...(hasSales ? [{
      icon: <ShoppingCart size={16} />, label: "Today's sales",
      value: formatMoney(s.today_sales_total, currency), sub: `${s.today_sales_count} sale${s.today_sales_count === 1 ? "" : "s"}`,
      tone: "bg-champagne-light/60 text-accent",
    }] : []),
    {
      icon: <Package size={16} />, label: "Products",
      value: String(s.total_products), sub: "in stock list", tone: "bg-background-2 text-foreground",
    },
    {
      icon: <AlertTriangle size={16} />, label: "Low stock",
      value: String(s.low_stock_count), sub: "need attention", tone: s.low_stock_count > 0 ? "bg-warning/10 text-warning" : "bg-background-2 text-muted-foreground",
    },
    {
      icon: <Wallet size={16} />, label: "Stock value",
      value: formatMoney(s.inventory_value, currency), sub: "at cost", tone: "bg-background-2 text-foreground",
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold">
            {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
          </h1>
          <p className="text-xs text-muted-foreground">{workspace.workspace.name}</p>
        </div>
        {hasSales && (
          <Button size="sm" onClick={() => navigate("/app/sales/new")}>
            <Plus size={16} /> New sale
          </Button>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4">
            <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-md ${k.tone}`}>
              {k.icon}
            </div>
            <p className="text-2xs text-muted-foreground">{k.label}</p>
            <p className="tabular mt-0.5 truncate text-lg font-bold">{k.value}</p>
            {k.sub && <p className="text-2xs text-muted-foreground">{k.sub}</p>}
          </Card>
        ))}
      </div>

      {/* Sales chart */}
      {hasSales && totalSales > 0 && (
        <Card>
          <CardBody className="pt-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Sales</h3>
              <div className="flex gap-1 rounded-md bg-background-2 p-0.5">
                {RANGES.map((r) => (
                  <button
                    key={r.days}
                    onClick={() => setRange(r.days)}
                    className={`rounded px-2.5 py-1 text-2xs font-medium transition-colors ${
                      range === r.days ? "bg-surface shadow-xs" : "text-muted-foreground"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#B49A70" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#B49A70" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#77746D" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis hide />
                  <Tooltip
                    formatter={(v: number) => formatMoney(v * 100, currency)}
                    contentStyle={{ borderRadius: 10, border: "1px solid #E9E6DF", fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="total" stroke="#B49A70" strokeWidth={2} fill="url(#salesFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Empty state first-use */}
      {s.total_products === 0 && (
        <Card>
          <EmptyState
            title="No products yet"
            message="Add your first product to start tracking stock and sales."
            action={
              seedDemo.isPending ? (
                <Button loading size="md">Preparing…</Button>
              ) : (
                <div className="flex gap-2">
                  <Button onClick={() => navigate("/app/inventory/new")}>
                    <Plus size={16} /> Add product
                  </Button>
                  <Button variant="secondary" onClick={() => seedDemo.mutate()}>
                    Add sample
                  </Button>
                </div>
              )
            }
          />
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Recent sales */}
        {hasSales && (
          <Card>
            <CardBody className="pt-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Recent sales</h3>
                <Link to="/app/sales" className="flex items-center gap-0.5 text-2xs font-medium text-accent">
                  View all <ArrowRight size={12} />
                </Link>
              </div>
              {data.recent_sales.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">No sales recorded yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {data.recent_sales.map((sale) => (
                    <li key={sale.id}>
                      <Link to={`/app/sales/${sale.id}`} className="flex items-center justify-between py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{sale.customer_name || sale.sale_no}</p>
                          <p className="text-2xs text-muted-foreground">{formatDateTime(sale.created_at)}</p>
                        </div>
                        <p className="tabular text-sm font-semibold">{formatMoney(sale.total, currency)}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        )}

        {/* Low stock */}
        <Card>
          <CardBody className="pt-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Low stock</h3>
              <Link to="/app/inventory?stock=low" className="flex items-center gap-0.5 text-2xs font-medium text-accent">
                View all <ArrowRight size={12} />
              </Link>
            </div>
            {data.low_stock.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                {s.total_products === 0 ? "Stock levels will appear here." : "Everything is well stocked."}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {data.low_stock.map((p) => (
                  <li key={p.id}>
                    <Link to={`/app/inventory/${p.id}`} className="flex items-center justify-between py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        <p className="text-2xs text-muted-foreground">{p.sku}</p>
                      </div>
                      <Badge tone={p.stock_qty === 0 ? "danger" : "warning"}>
                        {p.stock_qty} left
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* Top products */}
        {hasSales && s.top_products.length > 0 && (
          <Card>
            <CardBody className="pt-4">
              <h3 className="mb-3 text-sm font-semibold">Top selling</h3>
              <ul className="divide-y divide-line">
                {s.top_products.map((p) => (
                  <li key={p.product_id} className="flex items-center justify-between py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <TrendingUp size={14} className="shrink-0 text-accent" />
                      <p className="truncate text-sm font-medium">{p.name}</p>
                    </div>
                    <p className="tabular text-2xs text-muted-foreground">{p.quantity} sold</p>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}

        {/* Recent purchases */}
        {modules.purchases && (
          <Card>
            <CardBody className="pt-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Recent purchases</h3>
                <Link to="/app/purchases" className="flex items-center gap-0.5 text-2xs font-medium text-accent">
                  View all <ArrowRight size={12} />
                </Link>
              </div>
              {data.recent_purchases.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">Your purchase history will appear here.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {data.recent_purchases.map((p) => (
                    <li key={p.id} className="flex items-center justify-between py-2.5">
                      <div>
                        <p className="text-sm font-medium">{p.purchase_no}</p>
                        <p className="text-2xs capitalize text-muted-foreground">{p.status}</p>
                      </div>
                      <p className="tabular text-sm font-semibold">{formatMoney(p.total, currency)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
