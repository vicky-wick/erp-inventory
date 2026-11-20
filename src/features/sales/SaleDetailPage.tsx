import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { useSession } from "@/providers/session";
import { formatMoney, formatDateTime } from "@/lib/format";
import { Badge, Skeleton } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, ConfirmDialog } from "@/components/ui/sheet";
import { ErrorState } from "@/components/ui/states";
import { ArrowLeft, Printer, Undo2, Minus, Plus } from "lucide-react";
import { businessTypesLabel } from "@/types";
import type { Sale, SaleItem } from "@/types";

const PAYMENT_LABELS: Record<string, string> = { cash: "Cash", upi: "UPI", card: "Card", other: "Other" };
const STATUS_TONES: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  completed: "success", partially_returned: "warning", returned: "neutral", cancelled: "danger",
};

function discountLabel(sale: Sale): string {
  const value = Number(sale.discount_value ?? 0);
  if (sale.discount_type === "percent" && value > 0) {
    const pct = (value / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
    return `Discount (${pct}%)`;
  }
  return "Discount";
}

export default function SaleDetailPage() {
  const { id } = useParams();
  const { workspace } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const wid = workspace?.workspace.id;
  const currency = workspace?.workspace.currency ?? "INR";

  const [returnOpen, setReturnOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["sale", wid, id],
    queryFn: () => get<{ sale: Sale; items: SaleItem[] }>(`/workspaces/${wid}/sales/${id}`),
    enabled: !!wid && !!id,
  });

  const wsName = workspace?.workspace.name ?? "";
  const ws = workspace?.workspace;

  const doReturn = useMutation({
    mutationFn: () =>
      post(`/workspaces/${wid}/sales/${id}/return`, {
        items: Object.entries(returnQty)
          .filter(([, q]) => q > 0)
          .map(([item_id, quantity]) => ({ item_id, quantity })),
        reason: returnReason || null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries();
      setReturnOpen(false);
      setConfirmOpen(false);
      setReturnQty({});
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : "Return failed");
      setConfirmOpen(false);
    },
  });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-32" /><Skeleton className="h-64" /></div>;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;

  const { sale, items } = data;
  const canReturn = sale.status === "completed" || sale.status === "partially_returned";

  function print() {
    window.print();
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between no-print">
        <Link to="/app/sales" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={16} /> Sales
        </Link>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={print}>
            <Printer size={14} /> Print
          </Button>
          {canReturn && (
            <Button variant="secondary" size="sm" onClick={() => { setReturnQty({}); setError(null); setReturnOpen(true); }}>
              <Undo2 size={14} /> Return
            </Button>
          )}
        </div>
      </div>

      {/* Invoice — restrained gallery layout: hairlines, generous air, one gold signature */}
      <div className="invoice-sheet overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="h-0.5 w-full bg-accent" />
        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-charcoal">
                  <span className="font-display text-lg font-semibold text-gold">{wsName.slice(0, 1) || "E"}</span>
                </div>
                <div className="min-w-0">
                  <p className="truncate font-display text-[19px] font-semibold leading-tight tracking-[-0.01em]">{wsName}</p>
                  <p className="eyebrow mt-0.5 text-[10px] text-muted-foreground">{ws ? businessTypesLabel(ws) : "Retail"}</p>
                </div>
              </div>
              {(ws?.address || ws?.phone || ws?.gstin) && (
                <div className="mt-4 space-y-0.5 text-[11px] leading-[1.7] text-muted-foreground">
                  {ws?.address && <p className="whitespace-pre-line">{ws.address}</p>}
                  {ws?.phone && <p className="tabular">{ws.phone}</p>}
                  {ws?.gstin && <p className="tabular">GSTIN {ws.gstin}</p>}
                </div>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className="eyebrow text-[10px] text-accent">Invoice</p>
              <p className="tabular mt-1.5 text-sm font-semibold">{sale.sale_no}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(sale.created_at)}</p>
              <div className="mt-2.5 flex justify-end">
                <Badge tone={STATUS_TONES[sale.status]}>{sale.status.replace(/_/g, " ")}</Badge>
              </div>
            </div>
          </div>

          {(sale.customer_name || sale.customer_phone) && (
            <div className="mt-7 border-y border-line py-3">
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Billed to</p>
              <p className="mt-1 text-[13px] font-semibold">{sale.customer_name || "Walk-in customer"}</p>
              {sale.customer_phone && <p className="tabular mt-0.5 text-[11px] text-muted-foreground">{sale.customer_phone}</p>}
            </div>
          )}

          <table className="mt-7 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                <th className="pb-2.5 pr-2 font-semibold">Item</th>
                <th className="px-2 pb-2.5 text-center font-semibold">Qty</th>
                <th className="hidden px-2 pb-2.5 text-right font-semibold sm:table-cell">Rate</th>
                <th className="pb-2.5 pl-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-line/70 align-top last:border-0">
                  <td className="py-3.5 pr-2">
                    <p className="font-medium leading-snug">
                      {it.product_name}{it.variant_name ? ` — ${it.variant_name}` : ""}
                    </p>
                    <p className="tabular mt-1 text-[10px] tracking-[0.02em] text-muted-foreground">
                      {it.sku}{it.returned_qty > 0 ? ` · ${it.returned_qty} returned` : ""}
                    </p>
                  </td>
                  <td className="tabular px-2 py-3.5 text-center text-[13px]">{it.quantity}</td>
                  <td className="tabular hidden px-2 py-3.5 text-right text-[13px] text-muted-foreground sm:table-cell">
                    {formatMoney(it.unit_price, currency)}
                  </td>
                  <td className="tabular py-3.5 pl-2 text-right text-[13px] font-semibold">
                    {formatMoney(it.line_total, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <p className="flex items-center gap-2">
                <span className="text-[9px] font-semibold uppercase tracking-[0.16em]">Paid via</span>
                <span className="font-semibold text-foreground">{PAYMENT_LABELS[sale.payment_method] ?? sale.payment_method}</span>
              </p>
              {sale.notes && <p className="max-w-xs whitespace-pre-line">{sale.notes}</p>}
            </div>
            <div className="w-full space-y-2 text-[13px] sm:w-60">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular">{formatMoney(sale.subtotal, currency)}</span>
              </div>
              {(Number(sale.discount) > 0 || Number(sale.discount_value) > 0) && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{discountLabel(sale)}</span>
                  <span className="tabular whitespace-nowrap text-accent">−{formatMoney(sale.discount, currency)}</span>
                </div>
              )}
              <div className="flex items-baseline justify-between border-t border-line pt-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">Total</span>
                <span className="tabular font-display text-2xl font-semibold tracking-[-0.01em]">
                  {formatMoney(sale.total, currency)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-line pt-4 text-center">
            <p className="text-[11px] text-muted-foreground">{ws?.invoice_footer || "Thank you for your business."}</p>
            <p className="mt-1.5 text-[9px] uppercase tracking-[0.2em] text-muted-foreground/60">Powered by EVOLV</p>
          </div>
        </div>
      </div>

      {/* Return sheet */}
      <Sheet open={returnOpen} onClose={() => setReturnOpen(false)} title="Return items">
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">Enter how many of each item the customer is returning.</p>
          <ul className="space-y-2">
            {items.map((it) => {
              const remaining = it.quantity - it.returned_qty;
              if (remaining <= 0) return null;
              const qty = returnQty[it.id] ?? 0;
              return (
                <li key={it.id} className="flex items-center justify-between rounded-md border border-line p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{it.product_name}</p>
                    <p className="tabular text-2xs text-muted-foreground">{remaining} can be returned</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setReturnQty((q) => ({ ...q, [it.id]: Math.max(0, qty - 1) }))}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-line"
                      aria-label="Decrease return qty"
                    >
                      <Minus size={13} />
                    </button>
                    <span className="tabular w-8 text-center text-sm font-bold">{qty}</span>
                    <button
                      onClick={() => setReturnQty((q) => ({ ...q, [it.id]: Math.min(remaining, qty + 1) }))}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-line"
                      aria-label="Increase return qty"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Reason (optional)</span>
            <input
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              placeholder="e.g. customer changed mind"
              className="h-11 w-full rounded-md border border-line px-3 text-sm focus:border-champagne focus:outline-none"
            />
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button
            className="w-full" size="lg"
            disabled={Object.values(returnQty).every((q) => q === 0)}
            onClick={() => {
              setError(null);
              setConfirmOpen(true);
            }}
          >
            Continue return
          </Button>
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => doReturn.mutate()}
        title="Confirm return"
        message={`Returned items go back into stock and the sale status is updated. This cannot be undone. Continue?`}
        confirmLabel="Process return"
        danger
        loading={doReturn.isPending}
      />
    </div>
  );
}
