import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import { useSession } from "@/providers/session";
import { formatMoney, formatDateTime } from "@/lib/format";
import { Skeleton, Badge } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState, NoResults, ErrorState } from "@/components/ui/states";
import { Search, ShoppingCart } from "lucide-react";
import { useState, useMemo } from "react";
import type { Sale } from "@/types";

const STATUS_TONES: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  completed: "success", partially_returned: "warning", returned: "neutral", cancelled: "danger",
};
const PAYMENT_LABELS: Record<string, string> = { cash: "Cash", upi: "UPI", card: "Card", other: "Other" };

export default function SalesPage() {
  const { workspace } = useSession();
  const wid = workspace?.workspace.id;
  const currency = workspace?.workspace.currency ?? "INR";
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  useMemo(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["sales", wid, debounced],
    queryFn: () => get<{ sales: Sale[]; has_more: boolean }>(
      `/workspaces/${wid}/sales?per_page=50${debounced ? `&search=${encodeURIComponent(debounced)}` : ""}`
    ),
    enabled: !!wid,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold">Sales</h1>
        <Link to="/app/sales/new" className="rounded-md bg-charcoal px-3.5 py-2 text-sm font-medium text-white">
          + New sale
        </Link>
      </div>

      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search sale no, customer…" className="pl-9" />
      </div>

      {isLoading ? (
        <div className="space-y-2.5">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : !data || data.sales.length === 0 ? (
        debounced ? (
          <NoResults message="No sales match your search." />
        ) : (
          <EmptyState
            icon={<ShoppingCart size={24} />}
            title="No sales recorded yet"
            message="Record your first sale and it will appear here."
            action={
              <Link to="/app/sales/new" className="rounded-md bg-charcoal px-4 py-2.5 text-sm font-medium text-white">
                Record a sale
              </Link>
            }
          />
        )
      ) : (
        <ul className="space-y-2">
          {data.sales.map((s) => (
            <li key={s.id}>
              <Link
                to={`/app/sales/${s.id}`}
                className="flex items-center justify-between rounded-lg border border-line bg-surface p-3.5 shadow-xs transition-all hover:shadow-sm active:scale-[0.995]"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="tabular truncate text-sm font-semibold">{s.sale_no}</p>
                    <Badge tone={STATUS_TONES[s.status]}>{s.status.replace(/_/g, " ")}</Badge>
                  </div>
                  <p className="mt-0.5 text-2xs text-muted-foreground">
                    {formatDateTime(s.created_at)} · {PAYMENT_LABELS[s.payment_method]}
                    {s.customer_name ? ` · ${s.customer_name}` : ""}
                  </p>
                </div>
                <p className="tabular text-sm font-bold">{formatMoney(s.total, currency)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
