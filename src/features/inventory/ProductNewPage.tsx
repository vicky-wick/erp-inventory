import { useState, useEffect, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { useSession } from "@/providers/session";
import { parseMoneyToPaise } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import { cn } from "@/components/ui/button";
import type { AttributeDef, Category, Supplier, WorkspaceFull } from "@/types";

type VariantDraft = { sku: string; name: string; stock_qty: string; price: string };

export default function ProductNewPage() {
  const { workspace, modules } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const wid = workspace?.workspace.id;

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [stock, setStock] = useState("0");
  const [minStock, setMinStock] = useState("0");
  const [barcode, setBarcode] = useState("");
  const [brand, setBrand] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [description, setDescription] = useState("");
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [variantsOpen, setVariantsOpen] = useState(false);
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [attributeValues, setAttributeValues] = useState<Record<string, string | boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [autoSkuRequested, setAutoSkuRequested] = useState(false);

  const { data: settingsData } = useQuery({
    queryKey: ["workspace", wid],
    queryFn: () => get<WorkspaceFull>(`/workspaces/${wid}`),
    enabled: !!wid,
  });
  const { data: catData } = useQuery({
    queryKey: ["categories", wid],
    queryFn: () => get<{ categories: Category[] }>(`/workspaces/${wid}/categories`),
    enabled: !!wid,
  });
  const { data: supData } = useQuery({
    queryKey: ["suppliers", wid],
    queryFn: () => get<{ suppliers: Supplier[] }>(`/workspaces/${wid}/suppliers`),
    enabled: !!wid && modules.suppliers,
  });
  const { data: attrData } = useQuery({
    queryKey: ["attributes", wid],
    queryFn: () => get<{ attributes: AttributeDef[] }>(`/workspaces/${wid}/attributes`),
    enabled: !!wid,
  });

  const settings = settingsData?.settings;
  const autoSku = settings?.auto_sku ?? true;
  const allowManualSku = settings?.allow_manual_sku ?? true;
  const enableVariants = settings?.enable_variants ?? false;
  const attributes = (attrData?.attributes ?? []).filter((a) => a.is_active);

  // Auto-generate SKU once
  useEffect(() => {
    if (autoSku && wid && !autoSkuRequested && !sku) {
      setAutoSkuRequested(true);
      void post<{ sku: string }>(`/workspaces/${wid}/sku`).then((d) => setSku(d.sku)).catch(() => {});
    }
  }, [autoSku, wid, autoSkuRequested, sku]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        name, sku,
        selling_price: parseMoneyToPaise(sellingPrice),
        purchase_price: parseMoneyToPaise(purchasePrice),
        stock_qty: parseInt(stock || "0", 10),
        min_stock: parseInt(minStock || "0", 10),
      };
      if (barcode) payload.barcode = barcode;
      if (brand) payload.brand = brand;
      if (categoryId) payload.category_id = categoryId;
      if (supplierId) payload.supplier_id = supplierId;
      if (description) payload.description = description;
      const attrList = attributes
        .filter((a) => attributeValues[a.key] !== undefined && attributeValues[a.key] !== "")
        .map((a) => ({ attribute_id: a.id, value: attributeValues[a.key] }));
      if (attrList.length) payload.attributes = attrList;
      if (variants.length && variants.every((v) => v.name.trim() && v.sku.trim())) {
        payload.variants = variants.map((v) => ({
          sku: v.sku, name: v.name,
          stock_qty: parseInt(v.stock_qty || "0", 10),
          price_override: v.price ? parseMoneyToPaise(v.price) : null,
        }));
      }
      return post<{ product_id: string }>(`/workspaces/${wid}/products`, payload);
    },
    onSuccess: (d) => {
      void qc.invalidateQueries();
      navigate(`/app/inventory/${d.product_id}`, { replace: true });
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Product name is required");
    if (!sku.trim()) return setError("SKU is required");
    if (!sellingPrice || parseMoneyToPaise(sellingPrice) <= 0) return setError("Enter a selling price");
    if (variants.length > 0 && variants.some((v) => !v.name.trim() || !v.sku.trim())) {
      return setError("Every variant needs a name and SKU");
    }
    save.mutate();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 pb-20">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold">Add product</h1>
        <button type="button" onClick={() => navigate(-1)} className="text-sm text-muted-foreground hover:text-foreground">
          Cancel
        </button>
      </div>

      <Card>
        <CardBody className="space-y-4 pt-4">
          <Field label="Product name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Black Aviator Sunglasses" autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="SKU" hint={autoSku ? "Auto-generated" : undefined}>
              <Input
                value={sku} onChange={(e) => setSku(e.target.value.toUpperCase())}
                disabled={autoSku && !allowManualSku}
                className="tabular"
              />
            </Field>
            <Field label="Selling price">
              <Input
                inputMode="decimal" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)}
                placeholder="0.00" className="tabular"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Stock quantity" hint={variants.length > 0 ? "Managed by variants" : undefined}>
              <Input
                inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value.replace(/\D/g, ""))}
                disabled={variants.length > 0} className="tabular"
              />
            </Field>
            <Field label="Low-stock alert at">
              <Input
                inputMode="numeric" value={minStock} onChange={(e) => setMinStock(e.target.value.replace(/\D/g, ""))}
                className="tabular"
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      {enableVariants && (
        <Card>
          <button
            type="button"
            onClick={() => setVariantsOpen((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-3.5 text-sm font-semibold"
          >
            Variants {variants.length > 0 && <span className="text-2xs text-muted-foreground">({variants.length})</span>}
            <ChevronDown size={16} className={cn("transition-transform", variantsOpen && "rotate-180")} />
          </button>
          {variantsOpen && (
            <div className="space-y-3 border-t border-line px-4 pb-4 pt-3">
              <p className="text-2xs text-muted-foreground">
                Add colour, size or style options. Each variant tracks its own stock.
              </p>
              {variants.map((v, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_80px_36px] gap-2">
                  <Input value={v.name} onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Name" className="h-10" />
                  <Input value={v.sku} onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, sku: e.target.value.toUpperCase() } : x)))} placeholder="SKU" className="h-10 tabular" />
                  <Input inputMode="numeric" value={v.stock_qty} onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, stock_qty: e.target.value.replace(/\D/g, "") } : x)))} placeholder="Qty" className="h-10 tabular" />
                  <button
                    type="button"
                    onClick={() => setVariants((vs) => vs.filter((_, j) => j !== i))}
                    className="flex h-10 items-center justify-center rounded-md border border-line text-danger"
                    aria-label="Remove variant"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              <Button type="button" variant="secondary" size="sm" onClick={() => setVariants((vs) => [...vs, { sku: "", name: "", stock_qty: "0", price: "" }])}>
                <Plus size={14} /> Add variant
              </Button>
            </div>
          )}
        </Card>
      )}

      {attributes.length > 0 && (
        <Card>
          <CardBody className="space-y-4 pt-4">
            <p className="text-sm font-semibold">Additional details</p>
            {attributes.map((a) => (
              <Field key={a.id} label={a.name}>
                {a.field_type === "dropdown" ? (
                  <select
                    value={String(attributeValues[a.key] ?? "")}
                    onChange={(e) => setAttributeValues((v) => ({ ...v, [a.key]: e.target.value }))}
                    className="h-11 w-full rounded-md border border-line bg-surface px-3 text-base focus:border-champagne focus:outline-none focus:ring-2 focus:ring-champagne/40"
                  >
                    <option value="">Select…</option>
                    {a.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : a.field_type === "boolean" ? (
                  <label className="flex h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!attributeValues[a.key]}
                      onChange={(e) => setAttributeValues((v) => ({ ...v, [a.key]: e.target.checked }))}
                      className="h-5 w-5 accent-[#a37e35]"
                    />
                    Yes
                  </label>
                ) : (
                  <Input
                    inputMode={a.field_type === "number" ? "decimal" : "text"}
                    type={a.field_type === "number" ? "number" : "text"}
                    value={String(attributeValues[a.key] ?? "")}
                    onChange={(e) => setAttributeValues((v) => ({ ...v, [a.key]: e.target.value }))}
                  />
                )}
              </Field>
            ))}
          </CardBody>
        </Card>
      )}

      {/* Optional details */}
      <Card>
        <button
          type="button"
          onClick={() => setOptionalOpen((o) => !o)}
          className="flex w-full items-center justify-between px-4 py-3.5 text-sm font-semibold"
        >
          Optional details
          <ChevronDown size={16} className={cn("transition-transform", optionalOpen && "rotate-180")} />
        </button>
        {optionalOpen && (
          <CardBody className="space-y-4 border-t border-line pt-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Purchase price" optional>
                <Input inputMode="decimal" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} placeholder="0.00" className="tabular" />
              </Field>
              <Field label="Barcode" optional>
                <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} className="tabular" />
              </Field>
            </div>
            <Field label="Brand" optional>
              <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
            </Field>
            <Field label="Category" optional>
              <select
                value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
                className="h-11 w-full rounded-md border border-line bg-surface px-3 text-base focus:border-champagne focus:outline-none focus:ring-2 focus:ring-champagne/40"
              >
                <option value="">No category</option>
                {catData?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            {modules.suppliers && (
              <Field label="Supplier" optional>
                <select
                  value={supplierId} onChange={(e) => setSupplierId(e.target.value)}
                  className="h-11 w-full rounded-md border border-line bg-surface px-3 text-base focus:border-champagne focus:outline-none focus:ring-2 focus:ring-champagne/40"
                >
                  <option value="">No supplier</option>
                  {supData?.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            )}
            <Field label="Description" optional>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Any extra notes about this product" />
            </Field>
          </CardBody>
        )}
      </Card>

      {error && <p className="text-sm text-danger">{error}</p>}

      {/* Sticky save */}
      <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] border-t border-line bg-surface/95 p-3 backdrop-blur md:bottom-0 md:pl-60">
        <div className="mx-auto flex max-w-5xl gap-3">
          <Button type="button" variant="secondary" onClick={() => navigate("/app/inventory")} className="flex-1" size="lg">
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending} className="flex-[2]" size="lg">
            Save product
          </Button>
        </div>
      </div>
    </form>
  );
}
