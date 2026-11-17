import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { useSession } from "@/providers/session";
import { formatMoney, formatDate } from "@/lib/format";
import { Skeleton, Badge } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/sheet";
import { EmptyState, NoResults, ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { Truck, Plus } from "lucide-react";
import type { Purchase } from "@/types";

const STATUS_TONES: Record<string, "warning" | "success" | "danger"> = {
  draft: "warning", received: "success", cancelled: "danger",
};

export default function PurchasesPage() {
  const { workspace } = useSession();
  const qc = useQueryClient();
  const wid = workspace?.workspace.id;
  const currency = workspace?.workspace.currency ?? "INR";
  const [confirm, setConfirm] = useState<{ id: string; action: "receive" | "cancel" } | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["purchases", wid],
    queryFn: () => get<{ purchases: Purchase[] }>(`/workspaces/${wid}/purchases?per_page=50`),
    enabled: !!wid,
  });

  const act = useMutation({
    mutationFn: (c: { id: string; action: "receive" | "cancel" }) =>
      post(`/workspaces/${wid}/purchases/${c.id}/${c.action === "receive" ? "receive" : "cancel"}`),
    onSuccess: () => {
      void qc.invalidateQueries();
      setConfirm(null);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold">Purchases</h1>
        <Link to="/app/purchases/new" className="rounded-md bg-charcoal px-3.5 py-2 text-sm font-medium text-white">
          + New
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-2.5">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : !data || data.purchases.length === 0 ? (
        <EmptyState
          icon={<Truck size={24} />}
          title="No purchases yet"
          message="Your purchase history will appear here."
          action={
            <Link to="/app/purchases/new" className="inline-flex items-center gap-1.5 rounded-md bg-charcoal px-4 py-2.5 text-sm font-medium text-white">
              <Plus size={15} /> Create a purchase
            </Link>
          }
        />
      ) : (
        <ul className="space-y-2">
          {data.purchases.map((p) => (
            <li key={p.id} className="rounded-lg border border-line bg-surface p-3.5 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="tabular truncate text-sm font-semibold">{p.purchase_no}</p>
                    <Badge tone={STATUS_TONES[p.status]}>{p.status}</Badge>
                  </div>
                  <p className="mt-0.5 text-2xs text-muted-foreground">
                    {formatDate(p.purchase_date)}
                    {p.supplier_name ? ` · ${p.supplier_name}` : ""}
                    {p.invoice_no ? ` · #${p.invoice_no}` : ""}
                  </p>
                </div>
                <p className="tabular text-sm font-bold">{formatMoney(p.total, currency)}</p>
              </div>
              {p.status === "draft" && (
                <div className="mt-3 flex gap-2 border-t border-line pt-3">
                  <Button size="sm" className="flex-1" onClick={() => setConfirm({ id: p.id, action: "receive" })}>
                    Receive stock
                  </Button>
                  <Button size="sm" variant="secondary" className="flex-1" onClick={() => setConfirm({ id: p.id, action: "cancel" })}>
                    Cancel
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && act.mutate(confirm)}
        title={confirm?.action === "receive" ? "Receive this purchase?" : "Cancel this purchase?"}
        message={
          confirm?.action === "receive"
            ? "Stock will be added for every item on this purchase. This is recorded in your stock history."
            : "A cancelled purchase stays in your history but stock is not affected."
        }
        confirmLabel={confirm?.action === "receive" ? "Receive" : "Cancel purchase"}
        danger={confirm?.action === "cancel"}
        loading={act.isPending}
      />
    </div>
  );
}
