import { useState, useMemo } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import { useSession } from "@/providers/session";
import { formatMoney } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Badge, Skeleton } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState, NoResults, ErrorState } from "@/components/ui/states";
import { Plus, Search, SlidersHorizontal, Package } from "lucide-react";
import { cn } from "@/components/ui/button";
import type { Product, Category } from "@/types";

const SORTS = [
  { value: "name", label: "Name A–Z" },
  { value: "newest", label: "Newest first" },
  { value: "price_asc", label: "Price low–high" },
  { value: "price_desc", label: "Price high–low" },
  { value: "qty_asc", label: "Stock low–high" },
  { value: "qty_desc", label: "Stock high–low" },
];
const STOCK_FILTERS = [
  { value: "", label: "All stock" },
  { value: "ok", label: "In stock" },
  { value: "low", label: "Low" },
  { value: "out", label: "Out" },
];

function stockBadge(p: Product) {
  if (p.stock_qty === 0) return <Badge tone="danger">Out of stock</Badge>;
  if (p.is_low_stock) return <Badge tone="warning">Low</Badge>;
  return <Badge tone="success">In stock</Badge>;
}

export default function InventoryPage() {
  const { workspace } = useSession();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const currency = workspace?.workspace.currency ?? "INR";
  const wid = workspace?.workspace.id;

  const categoryFilter = params.get("category") ?? "";
  const stockFilter = params.get("stock") ?? "";
  const sort = params.get("sort") ?? "name";

  const { data: categories } = useQuery({
    queryKey: ["categories", wid],
    queryFn: () => get<{ categories: Category[] }>(`/workspaces/${wid}/categories`),
    enabled: !!wid,
  });

  // Debounce search
  const [debounced, setDebounced] = useState("");
  useMemo(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = new URLSearchParams({
    search: debounced, sort,
    ...(categoryFilter && { category_id: categoryFilter }),
    ...(stockFilter && { stock: stockFilter }),
  }).toString();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["products", wid, debounced, sort, categoryFilter, stockFilter],
    queryFn: () => get<{ products: Product[]; has_more: boolean }>(`/workspaces/${wid}/products?${query}`),
    enabled: !!wid,
  });

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const activeFilters = (categoryFilter ? 1 : 0) + (stockFilter ? 1 : 0) + (sort !== "name" ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold">Inventory</h1>
        <Button size="sm" onClick={() => navigate("/app/inventory/new")}>
          <Plus size={16} /> Add
        </Button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, SKU, barcode…"
            className="pl-9"
          />
        </div>
        <button
          onClick={() => setFiltersOpen(true)}
          className={cn(
            "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-md border transition-colors",
            activeFilters ? "border-accent bg-champagne-light/40 text-accent" : "border-line bg-surface text-muted-foreground"
          )}
          aria-label="Filters"
        >
          <SlidersHorizontal size={18} />
          {activeFilters > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-white">
              {activeFilters}
            </span>
          )}
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2.5">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : !data || data.products.length === 0 ? (
        debounced || categoryFilter || stockFilter ? (
          <NoResults message="Try a different search or clear your filters." />
        ) : (
          <EmptyState
            icon={<Package size={24} />}
            title="No products yet"
            message="Add your first product to get started. It takes about 30 seconds."
            action={
              <Button onClick={() => navigate("/app/inventory/new")}>
                <Plus size={16} /> Add your first product
              </Button>
            }
          />
        )
      ) : (
        <ul className="space-y-2.5">
          {data.products.map((p) => (
            <li key={p.id}>
              <Link
                to={`/app/inventory/${p.id}`}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3 shadow-xs transition-all hover:shadow-sm active:scale-[0.995]"
              >
                {p.image_url ? (
                  <img src={p.image_url} alt="" className="h-14 w-14 shrink-0 rounded-md border border-line object-cover" />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-background-2 text-muted-foreground">
                    <Package size={20} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{p.name}</p>
                    <p className="tabular shrink-0 text-sm font-bold">{formatMoney(p.selling_price, currency)}</p>
                  </div>
                  <p className="mt-0.5 truncate text-2xs text-muted-foreground">
                    {p.sku}{p.category_name ? ` · ${p.category_name}` : ""}
                  </p>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="tabular text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{p.stock_qty}</span> in stock
                    </span>
                    {stockBadge(p)}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Filters sheet */}
      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filter & sort">
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-medium">Stock</p>
            <div className="flex flex-wrap gap-2">
              {STOCK_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFilter("stock", f.value)}
                  className={cn(
                    "rounded-full border px-3.5 py-2 text-xs font-medium transition-colors",
                    stockFilter === f.value ? "border-accent bg-champagne-light/40 text-accent" : "border-line bg-surface"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Category</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilter("category", "")}
                className={cn(
                  "rounded-full border px-3.5 py-2 text-xs font-medium transition-colors",
                  !categoryFilter ? "border-accent bg-champagne-light/40 text-accent" : "border-line bg-surface"
                )}
              >
                All
              </button>
              {categories?.categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setFilter("category", c.id)}
                  className={cn(
                    "rounded-full border px-3.5 py-2 text-xs font-medium transition-colors",
                    categoryFilter === c.id ? "border-accent bg-champagne-light/40 text-accent" : "border-line bg-surface"
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Sort by</p>
            <div className="space-y-2">
              {SORTS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setFilter("sort", s.value)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md border p-3 text-sm transition-colors",
                    sort === s.value ? "border-accent bg-champagne-light/40 font-medium" : "border-line bg-surface"
                  )}
                >
                  {s.label}
                  {sort === s.value && <span className="text-accent">✓</span>}
                </button>
              ))}
            </div>
          </div>

          <Button className="w-full" size="lg" onClick={() => setFiltersOpen(false)}>
            Show results
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
