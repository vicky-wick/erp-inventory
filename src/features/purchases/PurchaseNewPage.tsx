import { useState, useMemo, FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { useSession } from "@/providers/session";
import { formatMoney, parseMoneyToPaise, todayISO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { Search, Plus, Minus, Trash2 } from "lucide-react";
import { cn } from "@/components/ui/button";
import type { Product, Supplier } from "@/types";

type Line = { product: Product; qty: string; cost: string };

export default function PurchaseNewPage() {
  const { workspace, modules } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const wid = workspace?.workspace.id;
  const currency = workspace?.workspace.currency ?? "INR";

  const [lines, setLines] = useState<Line[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [receiveNow, setReceiveNow] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useMemo(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data } = useQuery({
    queryKey: ["products-purchase", wid, debounced],
    queryFn: () => get<{ products: Product[] }>(`/workspaces/${wid}/products?per_page=20${debounced ? `&search=${encodeURIComponent(debounced)}` : ""}`),
    enabled: !!wid && searchOpen,
  });
  const { data: supData } = useQuery({
    queryKey: ["suppliers", wid],
    queryFn: () => get<{ suppliers: Supplier[] }>(`/workspaces/${wid}/suppliers`),
    enabled: !!wid && modules.suppliers,
  });

  const total = lines.reduce((s, l) => s + (parseInt(l.qty || "0", 10) || 0) * parseMoneyToPaise(l.cost || "0"), 0);

  function addProduct(p: Product) {
    setLines((ls) =>
      ls.some((l) => l.product.id === p.id)
        ? ls
        : [...ls, { product: p, qty: "1", cost: (p.purchase_price / 100).toString() }]
    );
  }

  const save = useMutation({
    mutationFn: (receive: boolean) =>
      post<{ purchase_id: string; purchase_no: string }>(`/workspaces/${wid}/purchases`, {
        items: lines.map((l) => ({
          product_id: l.product.id,
          product_name: l.product.name,
          sku: l.product.sku,
          quantity: parseInt(l.qty, 10),
          unit_cost: parseMoneyToPaise(l.cost),
        })),
        supplier_id: supplierId || null,
        invoice_no: invoiceNo || null,
        purchase_date: date || null,
        notes: notes || null,
        receive_now: receive,
      }),
    onSuccess: (d) => {
      void qc.invalidateQueries();
      navigate("/app/purchases");
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (lines.length === 0) return setError("Add at least one product");
    if (lines.some((l) => !parseInt(l.qty, 10) || parseInt(l.qty, 10) <= 0)) return setError("Every line needs a quantity");
    save.mutate(receiveNow);
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold">New purchase</h1>
        <button type="button" onClick={() => navigate("/app/purchases")} className="text-sm text-muted-foreground hover:text-foreground">
          Cancel
        </button>
      </div>

      <Card>
        <CardBody className="space-y-3 pt-4">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-dashed border-line text-sm font-medium text-muted-foreground hover:border-accent hover:text-accent"
          >
            <Plus size={16} /> Add products
          </button>
          {lines.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">Add products you received</p>
          ) : (
            <ul className="divide-y divide-line">
              {lines.map((l) => (
                <li key={l.product.id} className="flex items-center gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.product.name}</p>
                    <div className="mt-1 flex gap-1.5">
                      <input
                        inputMode="numeric"
                        value={l.qty}
                        onChange={(e) => setLines((ls) => ls.map((x) => (x.product.id === l.product.id ? { ...x, qty: e.target.value.replace(/\D/g, "") } : x)))}
                        placeholder="Qty"
                        className="tabular h-9 w-16 rounded-md border border-line px-2 text-sm focus:border-champagne focus:outline-none"
                      />
                      <input
                        inputMode="decimal"
                        value={l.cost}
                        onChange={(e) => setLines((ls) => ls.map((x) => (x.product.id === l.product.id ? { ...x, cost: e.target.value.replace(/[^0-9.]/g, "") } : x)))}
                        placeholder="Cost"
                        className="tabular h-9 w-24 rounded-md border border-line px-2 text-sm focus:border-champagne focus:outline-none"
                      />
                    </div>
                  </div>
                  <p className="tabular text-sm font-semibold">{formatMoney((parseInt(l.qty || "0", 10) || 0) * parseMoneyToPaise(l.cost || "0"), currency)}</p>
                  <button
                    type="button"
                    onClick={() => setLines((ls) => ls.filter((x) => x.product.id !== l.product.id))}
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-line text-danger"
                    aria-label="Remove"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-between border-t border-line pt-3 text-sm font-bold">
            <span>Total</span>
            <span className="tabular">{formatMoney(total, currency)}</span>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4 pt-4">
          {modules.suppliers && (
            <Field label="Supplier" optional>
              <select
                value={supplierId} onChange={(e) => setSupplierId(e.target.value)}
                className="h-11 w-full rounded-md border border-line bg-surface px-3 text-base focus:border-champagne focus:outline-none"
              >
                <option value="">No supplier</option>
                {supData?.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Invoice no." optional>
              <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className="tabular" />
            </Field>
            <Field label="Date">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Notes" optional>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything to remember" />
          </Field>
          <label className="flex items-center gap-2.5 rounded-md bg-background-2 p-3 text-sm">
            <input type="checkbox" checked={receiveNow} onChange={(e) => setReceiveNow(e.target.checked)} className="h-5 w-5 accent-[#a37e35]" />
            Add to stock immediately
          </label>
        </CardBody>
      </Card>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] border-t border-line bg-surface/95 p-3 backdrop-blur md:bottom-0 md:pl-60">
        <div className="mx-auto flex max-w-5xl gap-3">
          <Button variant="secondary" onClick={() => save.mutate(false)} loading={save.isPending && !receiveNow} className="flex-1" size="lg">
            Save draft
          </Button>
          <Button onClick={(e) => onSubmit(e as unknown as FormEvent)} loading={save.isPending && receiveNow} className="flex-[2]" size="lg">
            Save & receive stock
          </Button>
        </div>
      </div>

      <Sheet open={searchOpen} onClose={() => setSearchOpen(false)} title="Add products">
        <div className="relative mb-3">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…" className="pl-9" />
        </div>
        <ul className="space-y-2">
          {data?.products.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => addProduct(p)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md border p-3 text-left",
                  lines.some((l) => l.product.id === p.id) ? "border-accent bg-champagne-light/30" : "border-line hover:bg-background-2"
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="tabular text-2xs text-muted-foreground">{p.sku} · {p.stock_qty} in stock</p>
                </div>
                <Plus size={16} className="text-muted-foreground" />
              </button>
            </li>
          ))}
          {data && data.products.length === 0 && (
            <p className="py-6 text-center text-xs text-muted-foreground">No matching products</p>
          )}
        </ul>
      </Sheet>
    </div>
  );
}
