import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { useSession } from "@/providers/session";
import { formatMoney, formatDateTime } from "@/lib/format";
import { Card, CardBody, Badge, Skeleton } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, ConfirmDialog } from "@/components/ui/sheet";
import { ErrorState } from "@/components/ui/states";
import { ArrowLeft, Printer, Undo2, Minus, Plus } from "lucide-react";
import type { Sale, SaleItem } from "@/types";

const PAYMENT_LABELS: Record<string, string> = { cash: "Cash", upi: "UPI", card: "Card", other: "Other" };
const STATUS_TONES: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  completed: "success", partially_returned: "warning", returned: "neutral", cancelled: "danger",
};

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

      {/* Invoice */}
      <Card>
        <CardBody className="pt-4">
          <div className="flex items-start justify-between border-b border-line pb-3">
            <div>
              <p className="font-display text-lg font-bold">{wsName}</p>
              <p className="tabular text-2xs text-muted-foreground">{sale.sale_no}</p>
            </div>
            <div className="text-right">
              <Badge tone={STATUS_TONES[sale.status]}>{sale.status.replace(/_/g, " ")}</Badge>
              <p className="mt-1 text-2xs text-muted-foreground">{formatDateTime(sale.created_at)}</p>
            </div>
          </div>

          {sale.customer_name && (
            <p className="mt-3 text-sm">
              <span className="text-muted-foreground">Customer:</span> <span className="font-medium">{sale.customer_name}</span>
              {sale.customer_phone && <span className="text-muted-foreground"> · {sale.customer_phone}</span>}
            </p>
          )}

          <ul className="mt-2 divide-y divide-line">
            {items.map((it) => {
              const remaining = it.quantity - it.returned_qty;
              return (
                <li key={it.id} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {it.product_name}{it.variant_name ? ` (${it.variant_name})` : ""}
                    </p>
                    <p className="tabular text-2xs text-muted-foreground">
                      {it.quantity} × {formatMoney(it.unit_price, currency)}
                      {it.returned_qty > 0 ? ` · ${it.returned_qty} returned` : ""}
                    </p>
                  </div>
                  <p className="tabular text-sm font-semibold">{formatMoney(it.line_total, currency)}</p>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 space-y-1.5 border-t border-line pt-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular">{formatMoney(sale.subtotal, currency)}</span>
            </div>
            {sale.discount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Discount</span>
                <span className="tabular text-danger">−{formatMoney(sale.discount, currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold">
              <span>Total</span>
              <span className="tabular">{formatMoney(sale.total, currency)}</span>
            </div>
            <p className="pt-1 text-2xs text-muted-foreground">Paid via {PAYMENT_LABELS[sale.payment_method]}</p>
          </div>

          {workspace?.workspace.invoice_footer && (
            <p className="mt-4 border-t border-line pt-3 text-center text-2xs text-muted-foreground">
              {workspace.workspace.invoice_footer}
            </p>
          )}
        </CardBody>
      </Card>

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
