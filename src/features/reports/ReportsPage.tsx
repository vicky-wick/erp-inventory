import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import { useSession } from "@/providers/session";
import { formatMoney, formatDate } from "@/lib/format";
import { Card, CardBody, Skeleton, Badge } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/states";
import { Download } from "lucide-react";

const PAYMENT_NAMES: Record<string, string> = { cash: "Cash", upi: "UPI", card: "Card", other: "Other" };

type Report = "sales" | "inventory" | "low-stock" | "purchases";

const TABS: { id: Report; label: string }[] = [
  { id: "sales", label: "Sales" },
  { id: "inventory", label: "Inventory" },
  { id: "low-stock", label: "Low stock" },
  { id: "purchases", label: "Purchases" },
];

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const { workspace } = useSession();
  const wid = workspace?.workspace.id;
  const currency = workspace?.workspace.currency ?? "INR";
  const [tab, setTab] = useState<Report>("sales");
  const [days, setDays] = useState(30);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["report", tab, wid, days],
    queryFn: () => get<Record<string, unknown>>(`/workspaces/${wid}/reports/${tab}${tab !== "inventory" && tab !== "low-stock" ? `?days=${days}` : ""}`),
    enabled: !!wid,
  });

  function exportCsv() {
    if (!data) return;
    const rows = (data.rows ?? data.low_stock ?? []) as Record<string, unknown>[];
    if (!rows.length) return;
    // Money columns stored in paise -> convert for the export
    const converted = rows.map((r) => {
      const out: Record<string, unknown> = { ...r };
      for (const k of Object.keys(out)) {
        if (/price|cost|total|revenue|value|subtotal|discount|amount/.test(k) && typeof out[k] === "number" && out[k] > 0) {
          out[k] = (out[k] as number) / 100;
        }
      }
      return out;
    });
    downloadCsv(`evolv-${tab}-report.csv`, converted);
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-bold">Reports</h1>

      <div className="flex gap-1 overflow-x-auto rounded-md bg-background-2 p-1 no-print">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 whitespace-nowrap rounded px-3 py-2 text-xs font-medium transition-colors ${
              tab === t.id ? "bg-surface shadow-xs" : "text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab !== "inventory" && tab !== "low-stock" && (
        <div className="flex gap-1.5">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                days === d ? "border-accent bg-champagne-light/40 text-accent" : "border-line bg-surface text-muted-foreground"
              }`}
            >
              {d === 7 ? "7 days" : d === 30 ? "30 days" : "90 days"}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : isError || !data ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (
        <>
          {tab === "sales" && (
            <SalesReport data={data as never} currency={currency} onExport={exportCsv} />
          )}
          {tab === "inventory" && (
            <InventoryReport data={data as never} currency={currency} onExport={exportCsv} />
          )}
          {tab === "low-stock" && (
            <LowStockReport data={data as never} currency={currency} onExport={exportCsv} />
          )}
          {tab === "purchases" && (
            <PurchasesReport data={data as never} currency={currency} onExport={exportCsv} />
          )}
        </>
      )}
    </div>
  );
}

function ExportButton({ onExport, disabled }: { onExport: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onExport}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:bg-background-2 disabled:opacity-50"
    >
      <Download size={13} /> CSV
    </button>
  );
}

function SalesReport({ data, currency, onExport }: { data: { summary: { sales_count: number; revenue: string; discount: string; avg_sale: string }; by_payment_method: { payment_method: string; count: number; total: string }[]; rows: { sale_no: string; created_at: string; customer_name: string | null; payment_method: string; status: string; total: string }[] }; currency: string; onExport: () => void }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { l: "Sales", v: String(data.summary.sales_count) },
          { l: "Revenue", v: formatMoney(data.summary.revenue, currency) },
          { l: "Discounts", v: formatMoney(data.summary.discount, currency) },
          { l: "Avg sale", v: formatMoney(data.summary.avg_sale, currency) },
        ].map((k) => (
          <Card key={k.l} className="p-3.5">
            <p className="text-2xs text-muted-foreground">{k.l}</p>
            <p className="tabular mt-1 truncate text-base font-bold">{k.v}</p>
          </Card>
        ))}
      </div>
      {data.by_payment_method.length > 0 && (
        <Card>
          <CardBody className="pt-4">
            <p className="mb-2 text-sm font-semibold">By payment method</p>
            <ul className="divide-y divide-line">
              {data.by_payment_method.map((m) => (
                <li key={m.payment_method} className="flex justify-between py-2 text-sm capitalize">
                  <span>{m.payment_method} <span className="text-muted-foreground">({m.count})</span></span>
                  <span className="tabular font-semibold">{formatMoney(m.total, currency)}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
      <Card>
        <CardBody className="pt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Sales ({data.rows.length})</p>
            <ExportButton onExport={onExport} disabled={!data.rows.length} />
          </div>
          <ul className="divide-y divide-line">
            {data.rows.slice(0, 100).map((r) => (
              <li key={r.sale_no} className="flex justify-between py-2 text-sm">
                <div>
                  <p className="tabular font-medium">{r.sale_no}</p>
                  <p className="text-2xs capitalize text-muted-foreground">
                    {formatDate(r.created_at)} · {PAYMENT_NAMES[r.payment_method] ?? r.payment_method}{r.customer_name ? ` · ${r.customer_name}` : ""}
                  </p>
                </div>
                <span className="tabular font-semibold">{formatMoney(r.total, currency)}</span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </>
  );
}

function InventoryReport({ data, currency, onExport }: { data: { totals: { products: number; units: number; stock_value: string }; rows: { sku: string; name: string; category: string; stock_qty: number; purchase_price: string; selling_price: string; stock_value: string }[] }; currency: string; onExport: () => void }) {
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {[
          { l: "Products", v: String(data.totals.products) },
          { l: "Units", v: String(data.totals.units) },
          { l: "Stock value", v: formatMoney(data.totals.stock_value, currency) },
        ].map((k) => (
          <Card key={k.l} className="p-3.5">
            <p className="text-2xs text-muted-foreground">{k.l}</p>
            <p className="tabular mt-1 truncate text-base font-bold">{k.v}</p>
          </Card>
        ))}
      </div>
      <Card>
        <CardBody className="pt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Products ({data.rows.length})</p>
            <ExportButton onExport={onExport} disabled={!data.rows.length} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-2xs text-muted-foreground">
                  <th className="pb-2 pr-2 font-medium">Product</th>
                  <th className="pb-2 pr-2 text-right font-medium">Stock</th>
                  <th className="pb-2 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.rows.slice(0, 100).map((r) => (
                  <tr key={r.sku}>
                    <td className="py-2 pr-2">
                      <p className="max-w-[180px] truncate font-medium">{r.name}</p>
                      <p className="tabular text-2xs text-muted-foreground">{r.sku}</p>
                    </td>
                    <td className="tabular py-2 text-right">{r.stock_qty}</td>
                    <td className="tabular py-2 text-right font-semibold">{formatMoney(r.stock_value, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </>
  );
}

function LowStockReport({ data, currency, onExport }: { data: { rows: { sku: string; name: string; stock_qty: number; threshold: number; purchase_price: string }[] }; currency: string; onExport: () => void }) {
  return (
    <Card>
      <CardBody className="pt-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">Low stock ({data.rows.length})</p>
          <ExportButton onExport={onExport} disabled={!data.rows.length} />
        </div>
        {data.rows.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Everything is well stocked.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.rows.map((r) => (
              <li key={r.sku} className="flex justify-between py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.name}</p>
                  <p className="tabular text-2xs text-muted-foreground">{r.sku}</p>
                </div>
                <Badge tone={r.stock_qty === 0 ? "danger" : "warning"}>
                  {r.stock_qty} / {r.threshold}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function PurchasesReport({ data, currency, onExport }: { data: { summary: { purchases: number; total: string }; rows: { purchase_no: string; purchase_date: string; status: string; total: string; supplier: string }[] }; currency: string; onExport: () => void }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {[
          { l: "Received purchases", v: String(data.summary.purchases) },
          { l: "Total spent", v: formatMoney(data.summary.total, currency) },
        ].map((k) => (
          <Card key={k.l} className="p-3.5">
            <p className="text-2xs text-muted-foreground">{k.l}</p>
            <p className="tabular mt-1 truncate text-base font-bold">{k.v}</p>
          </Card>
        ))}
      </div>
      <Card>
        <CardBody className="pt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Purchases ({data.rows.length})</p>
            <ExportButton onExport={onExport} disabled={!data.rows.length} />
          </div>
          <ul className="divide-y divide-line">
            {data.rows.slice(0, 100).map((r) => (
              <li key={r.purchase_no} className="flex justify-between py-2 text-sm">
                <div>
                  <p className="tabular font-medium">{r.purchase_no}</p>
                  <p className="text-2xs capitalize text-muted-foreground">
                    {formatDate(r.purchase_date)} · {r.status}{r.supplier ? ` · ${r.supplier}` : ""}
                  </p>
                </div>
                <span className="tabular font-semibold">{formatMoney(r.total, currency)}</span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </>
  );
}
