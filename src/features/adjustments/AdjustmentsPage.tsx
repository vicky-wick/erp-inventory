import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { useSession } from "@/providers/session";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Card, CardBody, Skeleton } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Search, SlidersHorizontal } from "lucide-react";
import { cn } from "@/components/ui/button";
import type { Product } from "@/types";

const REASONS = [
  { v: "damage", l: "Damaged" }, { v: "missing", l: "Missing" },
  { v: "correction", l: "Stock correction" }, { v: "other", l: "Other" },
];

export default function AdjustmentsPage() {
  const { workspace } = useSession();
  const qc = useQueryClient();
  const wid = workspace?.workspace.id;

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("correction");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ new_qty: number } | null>(null);

  // debounce
  const [t, setT] = useState<ReturnType<typeof setTimeout> | null>(null);
  function onSearch(v: string) {
    setSearch(v);
    if (t) clearTimeout(t);
    setT(setTimeout(() => setDebounced(v), 250));
  }

  const { data, isFetching } = useQuery({
    queryKey: ["products-adjust", wid, debounced],
    queryFn: () => get<{ products: Product[] }>(`/workspaces/${wid}/products?per_page=15${debounced ? `&search=${encodeURIComponent(debounced)}` : ""}`),
    enabled: !!wid,
  });

  const adjust = useMutation({
    mutationFn: () =>
      post<{ new_qty: number }>(`/workspaces/${wid}/adjustments`, {
        product_id: selected!.id,
        quantity_change: parseInt(qty, 10),
        reason,
        note: note || null,
      }),
    onSuccess: (d) => {
      void qc.invalidateQueries();
      setDone(d);
      setSelected(null); setQty(""); setNote("");
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Adjustment failed"),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-bold">Stock adjustment</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Fix stock after damage, loss or a physical count. Every change is recorded.
        </p>
      </div>

      {done && (
        <div className="rounded-md bg-success/10 px-4 py-3 text-sm text-success">
          Stock updated. New quantity: <span className="tabular font-bold">{done.new_qty}</span>
        </div>
      )}

      <Card>
        <CardBody className="pt-4">
          <Field label="Find a product">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search products…" className="pl-9" />
            </div>
          </Field>
          {isFetching ? (
            <div className="mt-3 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : data && data.products.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {data.products.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => { setSelected(p); setError(null); }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md border p-3 text-left transition-colors",
                      selected?.id === p.id ? "border-accent bg-champagne-light/30" : "border-line hover:bg-background-2"
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="tabular text-2xs text-muted-foreground">{p.sku} · {p.stock_qty} in stock</p>
                    </div>
                    <SlidersHorizontal size={15} className="text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              {search ? "No matching products" : "Search for a product above"}
            </p>
          )}
        </CardBody>
      </Card>

      {selected && (
        <Card>
          <CardBody className="space-y-4 pt-4">
            <div className="flex items-center justify-between rounded-md bg-background-2 p-3">
              <p className="truncate text-sm font-medium">{selected.name}</p>
              <p className="tabular text-sm font-bold">{selected.stock_qty} in stock</p>
            </div>
            <Field label="Quantity change" hint="Negative to reduce (e.g. -3), positive to add">
              <Input
                inputMode="text" value={qty}
                onChange={(e) => setQty(e.target.value.replace(/[^\d-]/g, ""))}
                placeholder="e.g. -3" className="tabular"
              />
            </Field>
            <Field label="Reason">
              <div className="grid grid-cols-2 gap-2">
                {REASONS.map((r) => (
                  <button
                    key={r.v} type="button" onClick={() => setReason(r.v)}
                    className={cn(
                      "rounded-md border p-2.5 text-xs font-medium transition-colors",
                      reason === r.v ? "border-accent bg-champagne-light/40 text-accent" : "border-line bg-surface"
                    )}
                  >
                    {r.l}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Note" optional>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened?" />
            </Field>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button
              className="w-full" size="lg" loading={adjust.isPending}
              onClick={() => {
                setError(null);
                const n = parseInt(qty, 10);
                if (!n || isNaN(n)) return setError("Enter a non-zero quantity");
                adjust.mutate();
              }}
            >
              Save adjustment
            </Button>
          </CardBody>
        </Card>
      )}

      {data && data.products.length === 0 && !search && !isFetching && (
        <EmptyState
          title="No products to adjust"
          message="Add products in Inventory first."
          className="py-8"
        />
      )}
    </div>
  );
}
