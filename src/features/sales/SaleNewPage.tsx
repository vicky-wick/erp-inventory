import { useState, useMemo, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { useSession } from "@/providers/session";
import { formatMoney, parseMoneyToPaise } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/states";
import { Search, X, Plus, Minus, Check } from "lucide-react";
import { cn } from "@/components/ui/button";
import type { Product } from "@/types";

type Line = { product: Product; qty: number; unitPrice: number };

const PAYMENTS = [
  { v: "cash", l: "Cash" }, { v: "upi", l: "UPI" },
  { v: "card", l: "Card" }, { v: "other", l: "Other" },
] as const;

// Percent discounts travel to the server as basis points (12.5% -> 1250) and
// are recomputed against the real subtotal inside the database transaction.
function parsePercent(input: string): number {
  const n = parseFloat(input.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function formatPercent(bps: number): string {
  return (bps / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function SaleNewPage() {
  const { workspace } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const wid = workspace?.workspace.id;
  const currency = workspace?.workspace.currency ?? "INR";

  const [lines, setLines] = useState<Line[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [discount, setDiscount] = useState("");
  const [discountMode, setDiscountMode] = useState<"amount" | "percent">("amount");
  const [payment, setPayment] = useState<(typeof PAYMENTS)[number]["v"]>("cash");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useMemo(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isFetching } = useQuery({
    queryKey: ["products-sale", wid, debounced],
    queryFn: () => get<{ products: Product[] }>(
      `/workspaces/${wid}/products?per_page=20${debounced ? `&search=${encodeURIComponent(debounced)}` : ""}`
    ),
    enabled: !!wid && searchOpen,
  });

  const subtotal = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const percentEntered = discountMode === "percent" ? parsePercent(discount) : 0;
  const discountBps = Math.min(10000, Math.round(percentEntered * 100));
  const discountPaise =
    discountMode === "percent"
      ? Math.round((subtotal * discountBps) / 10000)
      : parseMoneyToPaise(discount || "0");
  const total = Math.max(0, subtotal - discountPaise);

  function chooseDiscountMode(mode: "amount" | "percent") {
    if (mode === discountMode) return;
    setDiscountMode(mode);
    setDiscount("");
    setError(null);
  }

  function addProduct(p: Product) {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.product.id === p.id);
      if (i >= 0) {
        return ls.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...ls, { product: p, qty: 1, unitPrice: p.selling_price }];
    });
  }

  const complete = useMutation({
    mutationFn: () =>
      post<{ sale: { sale_id: string; sale_no: string } }>(`/workspaces/${wid}/sales`, {
        items: lines.map((l) => ({
          product_id: l.product.id,
          product_name: l.product.name,
          sku: l.product.sku,
          quantity: l.qty,
          unit_price: l.unitPrice,
        })),
        discount: discountMode === "amount" ? discountPaise : 0,
        discount_type: discountMode,
        discount_value: discountMode === "amount" ? discountPaise : discountBps,
        payment_method: payment,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        notes: notes || null,
      }),
    onSuccess: (d) => {
      void qc.invalidateQueries();
      navigate(`/app/sales/${d.sale.sale_id}`, { replace: true });
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (lines.length === 0) return setError("Add at least one product");
    if (discountMode === "percent" && percentEntered > 100) return setError("Discount percentage must be between 0 and 100");
    if (discountPaise > subtotal) return setError("Discount cannot be more than the subtotal");
    complete.mutate();
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold">New sale</h1>
        <button type="button" onClick={() => navigate("/app/sales")} className="text-sm text-muted-foreground hover:text-foreground">
          Cancel
        </button>
      </div>

      {/* Items */}
      <div className="rounded-lg border border-line bg-surface p-3 shadow-xs">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-dashed border-line text-sm font-medium text-muted-foreground hover:border-accent hover:text-accent"
        >
          <Plus size={16} /> Add products
        </button>

        {lines.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Tap above to add products to this sale</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {lines.map((l) => (
              <li key={l.product.id} className="flex items-center gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.product.name}</p>
                  <p className="tabular text-2xs text-muted-foreground">
                    {formatMoney(l.unitPrice, currency)} · {l.product.stock_qty} in stock
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setLines((ls) => ls.map((x) => (x.product.id === l.product.id ? { ...x, qty: x.qty - 1 } : x)).filter((x) => x.qty > 0))}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-line hover:bg-background-2"
                    aria-label="Decrease"
                  >
                    <Minus size={13} />
                  </button>
                  <span className="tabular w-8 text-center text-sm font-bold">{l.qty}</span>
                  <button
                    type="button"
                    onClick={() => setLines((ls) => ls.map((x) => (x.product.id === l.product.id ? { ...x, qty: x.qty + 1 } : x)))}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-line hover:bg-background-2"
                    aria-label="Increase"
                  >
                    <Plus size={13} />
                  </button>
                </div>
                <p className="tabular w-20 text-right text-sm font-semibold">
                  {formatMoney(l.qty * l.unitPrice, currency)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Totals */}
      <div className="space-y-2 rounded-lg border border-line bg-surface p-4 shadow-xs">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="tabular font-medium">{formatMoney(subtotal, currency)}</span>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">Discount</span>
            <div className="flex items-center rounded-full border border-line bg-background-2 p-0.5" role="group" aria-label="Discount mode">
              <button
                type="button"
                onClick={() => chooseDiscountMode("amount")}
                aria-pressed={discountMode === "amount"}
                className={cn(
                  "rounded-full px-3 py-1 text-2xs font-semibold transition-colors",
                  discountMode === "amount" ? "bg-surface text-foreground shadow-xs" : "text-muted-foreground"
                )}
              >
                {currency === "INR" ? "₹" : currency}
              </button>
              <button
                type="button"
                onClick={() => chooseDiscountMode("percent")}
                aria-pressed={discountMode === "percent"}
                className={cn(
                  "rounded-full px-3 py-1 text-2xs font-semibold transition-colors",
                  discountMode === "percent" ? "bg-surface text-foreground shadow-xs" : "text-muted-foreground"
                )}
              >
                %
              </button>
            </div>
          </div>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {discountMode === "amount" ? (currency === "INR" ? "₹" : currency) : "%"}
            </span>
            <input
              inputMode="decimal"
              value={discount}
              onChange={(e) => setDiscount(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0"
              aria-label={discountMode === "percent" ? "Discount percentage" : "Discount amount"}
              className="tabular h-10 w-full rounded-md border border-line bg-background pl-9 pr-3 text-right text-sm focus:border-champagne focus:outline-none"
            />
          </div>
          {discountPaise > 0 && (
            <p className="tabular text-right text-2xs text-muted-foreground">
              {discountMode === "percent" && `${formatPercent(discountBps)}% off · `}
              <span className="text-accent">−{formatMoney(discountPaise, currency)}</span>
            </p>
          )}
        </div>
        <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
          <span>Total</span>
          <span className="tabular">{formatMoney(total, currency)}</span>
        </div>
      </div>

      {/* Payment */}
      <div className="rounded-lg border border-line bg-surface p-4 shadow-xs">
        <p className="mb-2 text-sm font-medium">Payment method</p>
        <div className="grid grid-cols-4 gap-2">
          {PAYMENTS.map((pm) => (
            <button
              key={pm.v}
              type="button"
              onClick={() => setPayment(pm.v)}
              className={cn(
                "rounded-md border py-2.5 text-xs font-semibold transition-colors",
                payment === pm.v ? "border-accent bg-champagne-light/40 text-accent" : "border-line bg-surface text-muted-foreground"
              )}
            >
              {pm.l}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Customer" optional>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Name" />
          </Field>
          <Field label="Phone" optional>
            <Input inputMode="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Phone" />
          </Field>
        </div>
        <Field label="Note" optional>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything to remember" />
        </Field>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {/* Sticky complete */}
      <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] border-t border-line bg-surface/95 p-3 backdrop-blur md:bottom-0 md:pl-60">
        <div className="mx-auto flex max-w-5xl items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-2xs text-muted-foreground">{lines.length} item{lines.length === 1 ? "" : "s"}</p>
            <p className="tabular truncate text-lg font-bold">{formatMoney(total, currency)}</p>
          </div>
          <Button
            onClick={() => onSubmit({ preventDefault: () => {} } as FormEvent)}
            loading={complete.isPending}
            disabled={lines.length === 0}
            size="lg"
            className="min-w-36 flex-1 rounded-full"
          >
            <Check size={16} /> Complete sale
          </Button>
        </div>
      </div>

      {/* Product search sheet */}
      <Sheet open={searchOpen} onClose={() => setSearchOpen(false)} title="Add products">
        <div className="relative mb-3">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…" className="pl-9"
          />
        </div>
        {isFetching ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Searching…</p>
        ) : !data || data.products.length === 0 ? (
          <EmptyState title="No matching products" message="Check the spelling or add the product in Inventory first." className="py-8" />
        ) : (
          <ul className="space-y-2">
            {data.products.map((p) => {
              const inCart = lines.find((l) => l.product.id === p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => addProduct(p)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md border p-3 text-left transition-colors",
                      inCart ? "border-accent bg-champagne-light/30" : "border-line hover:bg-background-2"
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="tabular text-2xs text-muted-foreground">
                        {formatMoney(p.selling_price, currency)} · {p.stock_qty} in stock
                      </p>
                    </div>
                    {inCart ? (
                      <span className="tabular flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-2xs font-bold text-white">
                        {inCart.qty} <Check size={10} />
                      </span>
                    ) : (
                      <Plus size={16} className="text-muted-foreground" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>
    </div>
  );
}
