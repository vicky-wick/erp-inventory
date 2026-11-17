import { useState, FormEvent } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, patch, post } from "@/lib/api";
import { useSession } from "@/providers/session";
import { formatMoney, paiseToInput, parseMoneyToPaise, formatDateTime } from "@/lib/format";
import { Card, CardBody, Badge, Skeleton } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/input";
import { Sheet, ConfirmDialog } from "@/components/ui/sheet";
import { ErrorState, EmptyState } from "@/components/ui/states";
import { ArrowLeft, Pencil, Archive, SlidersHorizontal, History } from "lucide-react";
import type { Product, Variant, StockMovement } from "@/types";

const MOVEMENT_LABELS: Record<string, string> = {
  opening_stock: "Opening stock", purchase_received: "Purchase", sale_completed: "Sale",
  sale_returned: "Return", damage: "Damage", missing: "Missing",
  manual_adjustment: "Adjustment", purchase_reversed: "Purchase reversed", sale_reversed: "Sale reversed",
};

export default function ProductDetailPage() {
  const { id } = useParams();
  const { workspace } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const wid = workspace?.workspace.id;
  const currency = workspace?.workspace.currency ?? "INR";

  const [editOpen, setEditOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [adjQty, setAdjQty] = useState("");
  const [adjReason, setAdjReason] = useState("correction");
  const [adjNote, setAdjNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["product", wid, id],
    queryFn: () =>
      get<{ product: Product; variants: Variant[]; attributes: { name: string; value: unknown }[]; movements: StockMovement[] }>(
        `/workspaces/${wid}/products/${id}`
      ),
    enabled: !!wid && !!id,
  });

  const saveEdit = useMutation({
    mutationFn: () =>
      patch(`/workspaces/${wid}/products/${id}`, {
        name: editName,
        selling_price: parseMoneyToPaise(editPrice),
        ...(editDesc ? { description: editDesc } : {}),
      }),
    onSuccess: () => {
      void qc.invalidateQueries();
      setEditOpen(false);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Save failed"),
  });

  const saveAdjust = useMutation({
    mutationFn: () =>
      post(`/workspaces/${wid}/adjustments`, {
        product_id: id,
        quantity_change: parseInt(adjQty, 10),
        reason: adjReason,
        note: adjNote || null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries();
      setAdjustOpen(false);
      setAdjQty(""); setAdjNote("");
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Adjustment failed"),
  });

  const archive = useMutation({
    mutationFn: () => post(`/workspaces/${wid}/products/${id}/archive`),
    onSuccess: () => {
      void qc.invalidateQueries();
      navigate("/app/inventory");
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-40" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;

  const p = data.product;

  function openEdit() {
    setEditName(p.name);
    setEditPrice(paiseToInput(p.selling_price));
    setEditDesc(p.description ?? "");
    setError(null);
    setEditOpen(true);
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <Link to="/app/inventory" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={16} /> Inventory
        </Link>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={openEdit}>
            <Pencil size={14} /> Edit
          </Button>
          <Button variant="secondary" size="sm" onClick={() => { setError(null); setAdjustOpen(true); }}>
            <SlidersHorizontal size={14} /> Adjust
          </Button>
        </div>
      </div>

      <Card>
        <CardBody className="pt-4">
          <div className="flex gap-4">
            {p.image_url ? (
              <img src={p.image_url} alt="" className="h-20 w-20 rounded-md border border-line object-cover" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-md bg-background-2 font-display text-2xl font-bold text-muted-foreground">
                {p.name.slice(0, 1)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <h1 className="font-display text-lg font-bold">{p.name}</h1>
                {p.status === "archived" && <Badge tone="neutral">Archived</Badge>}
              </div>
              <p className="tabular mt-0.5 text-xs text-muted-foreground">{p.sku}</p>
              <div className="mt-2 flex items-baseline gap-3">
                <p className="tabular text-xl font-bold">{formatMoney(p.selling_price, currency)}</p>
                {p.purchase_price > 0 && (
                  <p className="tabular text-xs text-muted-foreground">cost {formatMoney(p.purchase_price, currency)}</p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 rounded-md bg-background-2 p-3 text-center">
            <div>
              <p className="tabular text-lg font-bold">{p.stock_qty}</p>
              <p className="text-2xs text-muted-foreground">In stock</p>
            </div>
            <div>
              <p className="tabular text-lg font-bold">{p.min_stock}</p>
              <p className="text-2xs text-muted-foreground">Alert at</p>
            </div>
            <div>
              <p className="tabular text-lg font-bold">{p.stock_qty > 0 ? formatMoney(p.stock_qty * p.purchase_price, currency) : "—"}</p>
              <p className="text-2xs text-muted-foreground">Stock value</p>
            </div>
          </div>

          {p.is_low_stock && p.status === "active" && (
            <p className="mt-3 rounded-md bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
              {p.stock_qty === 0 ? "Out of stock — add stock via a purchase or adjustment." : "Running low — consider restocking soon."}
            </p>
          )}

          {data.attributes.length > 0 && (
            <dl className="mt-4 space-y-1.5 border-t border-line pt-3">
              {data.attributes.map((a) => (
                <div key={a.name} className="flex justify-between text-sm">
                  <dt className="text-muted-foreground">{a.name}</dt>
                  <dd className="font-medium">{String(a.value)}</dd>
                </div>
              ))}
            </dl>
          )}

          {p.description && (
            <p className="mt-3 border-t border-line pt-3 text-sm leading-relaxed text-muted-foreground">{p.description}</p>
          )}
        </CardBody>
      </Card>

      {data.variants.length > 0 && (
        <Card>
          <CardBody className="pt-4">
            <h3 className="mb-2 text-sm font-semibold">Variants</h3>
            <ul className="divide-y divide-line">
              {data.variants.map((v) => (
                <li key={v.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-medium">{v.name}</p>
                    <p className="tabular text-2xs text-muted-foreground">{v.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="tabular text-sm font-semibold">
                      {formatMoney(v.price_override ?? p.selling_price, currency)}
                    </p>
                    <p className="tabular text-2xs text-muted-foreground">{v.stock_qty} in stock</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody className="pt-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <History size={15} /> Stock history
          </h3>
          {data.movements.length === 0 ? (
            <EmptyState title="No movements yet" className="py-6" />
          ) : (
            <ul className="divide-y divide-line">
              {data.movements.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{MOVEMENT_LABELS[m.movement_type] ?? m.movement_type}</p>
                    <p className="truncate text-2xs text-muted-foreground">
                      {formatDateTime(m.created_at)}{m.note ? ` · ${m.note}` : ""}{m.reason && m.reason !== "opening" ? ` · ${m.reason}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`tabular text-sm font-bold ${m.quantity_change >= 0 ? "text-success" : "text-danger"}`}>
                      {m.quantity_change > 0 ? "+" : ""}{m.quantity_change}
                    </p>
                    <p className="tabular text-2xs text-muted-foreground">→ {m.new_qty}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {p.status === "active" && (
        <button
          onClick={() => setArchiveOpen(true)}
          className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-danger"
        >
          <Archive size={14} /> Archive this product
        </button>
      )}

      {/* Edit sheet */}
      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="Edit product">
        <div className="space-y-4">
          <Field label="Product name">
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          </Field>
          <Field label="Selling price">
            <Input inputMode="decimal" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} className="tabular" />
          </Field>
          <Field label="Description" optional>
            <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button
            className="w-full" size="lg" loading={saveEdit.isPending}
            onClick={() => { if (editName.trim()) saveEdit.mutate(); }}
          >
            Save changes
          </Button>
        </div>
      </Sheet>

      {/* Adjust sheet */}
      <Sheet open={adjustOpen} onClose={() => setAdjustOpen(false)} title="Adjust stock">
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Current stock: <span className="tabular font-bold text-foreground">{p.stock_qty}</span>
          </p>
          <Field label="Quantity change" hint="Use a minus sign to reduce, e.g. -2">
            <Input
              inputMode="numeric" value={adjQty}
              onChange={(e) => setAdjQty(e.target.value.replace(/[^\d-]/g, ""))}
              placeholder="e.g. -2 or 5" className="tabular"
            />
          </Field>
          <Field label="Reason">
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: "damage", l: "Damaged" }, { v: "missing", l: "Missing" },
                { v: "correction", l: "Stock correction" }, { v: "other", l: "Other" },
              ].map((r) => (
                <button
                  key={r.v}
                  type="button"
                  onClick={() => setAdjReason(r.v)}
                  className={`rounded-md border p-2.5 text-xs font-medium transition-colors ${
                    adjReason === r.v ? "border-accent bg-champagne-light/40 text-accent" : "border-line bg-surface"
                  }`}
                >
                  {r.l}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Note" optional>
            <Input value={adjNote} onChange={(e) => setAdjNote(e.target.value)} placeholder="What happened?" />
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button
            className="w-full" size="lg" loading={saveAdjust.isPending}
            onClick={() => {
              setError(null);
              const n = parseInt(adjQty, 10);
              if (!n || isNaN(n)) return setError("Enter a non-zero quantity");
              if (Math.abs(n) > Math.max(20, p.stock_qty)) {
                if (!confirm(`Adjust stock by ${n}? This is a large change.`)) return;
              }
              saveAdjust.mutate();
            }}
          >
            Save adjustment
          </Button>
        </div>
      </Sheet>

      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={() => archive.mutate()}
        title="Archive product?"
        message="The product will be hidden from your inventory list. Its history is preserved. You can't undo this from the app yet."
        confirmLabel="Archive"
        danger
        loading={archive.isPending}
      />
    </div>
  );
}
