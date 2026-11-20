import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, patch, post } from "@/lib/api";
import { useSession } from "@/providers/session";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/input";
import { Card, CardBody, Skeleton } from "@/components/ui/card";
import { Sheet, ConfirmDialog } from "@/components/ui/sheet";
import { ErrorState } from "@/components/ui/states";
import { cn } from "@/components/ui/button";
import { LogOut, ChevronDown, Plus, Trash2, Store, SlidersHorizontal, Tags, FileText, User, Check, Upload } from "lucide-react";
import { WorkspaceLogo } from "@/components/ui/workspace-logo";
import { BUSINESS_TYPES, CURRENCIES, OPTIONAL_MODULES, CORE_MODULES, MODULE_LABELS, businessTypesOf, type WorkspaceFull, type AttributeDef } from "@/types";

const SECTIONS = [
  { id: "profile", label: "Business profile", icon: <Store size={16} /> },
  { id: "customize", label: "Modules", icon: <SlidersHorizontal size={16} /> },
  { id: "attributes", label: "Product fields", icon: <Tags size={16} /> },
  { id: "inventory", label: "Inventory", icon: <SlidersHorizontal size={16} /> },
  { id: "invoice", label: "Invoice", icon: <FileText size={16} /> },
  { id: "account", label: "Account", icon: <User size={16} /> },
] as const;

export default function SettingsPage() {
  const { workspace, user, modules, setActiveId, logout, refreshWorkspace } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const wid = workspace?.workspace.id;

  const [section, setSection] = useState<(typeof SECTIONS)[number]["id"]>("profile");

  // profile state
  const [name, setName] = useState(workspace?.workspace.name ?? "");
  const [phone, setPhone] = useState(workspace?.workspace.phone ?? "");
  const [email, setEmail] = useState(workspace?.workspace.email ?? "");
  const [address, setAddress] = useState(workspace?.workspace.address ?? "");
  const [currency, setCurrency] = useState(workspace?.workspace.currency ?? "INR");
  const [businessTypes, setBusinessTypes] = useState<string[]>(
    workspace ? businessTypesOf(workspace.workspace) : ["general"]
  );
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  // logo upload
  const [logoUrl, setLogoUrl] = useState<string | null>(workspace?.workspace.logo_url ?? null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoMsg, setLogoMsg] = useState<string | null>(null);
  const [logoErr, setLogoErr] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);

  // Keep the preview in step when the active workspace changes.
  useEffect(() => {
    setLogoUrl(workspace?.workspace.logo_url ?? null);
  }, [workspace?.workspace.id, workspace?.workspace.logo_url]);

  // invoice state
  const [invoicePrefix, setInvoicePrefix] = useState(workspace?.workspace.invoice_prefix ?? "INV");
  const [invoiceTitle, setInvoiceTitle] = useState(workspace?.workspace.invoice_title ?? "");
  const [gstin, setGstin] = useState(workspace?.workspace.gstin ?? "");
  const [invoiceFooter, setInvoiceFooter] = useState(workspace?.workspace.invoice_footer ?? "");
  const [invoiceTerms, setInvoiceTerms] = useState(workspace?.workspace.invoice_terms ?? "");
  const [showLogo, setShowLogo] = useState(workspace?.workspace.invoice_show_logo ?? true);
  const [showAddress, setShowAddress] = useState(workspace?.workspace.invoice_show_address ?? true);
  const [showPhone, setShowPhone] = useState(workspace?.workspace.invoice_show_phone ?? true);
  const [showGstin, setShowGstin] = useState(workspace?.workspace.invoice_show_gstin ?? true);
  const [showSku, setShowSku] = useState(workspace?.workspace.invoice_show_sku ?? true);
  const [invoiceMsg, setInvoiceMsg] = useState<string | null>(null);
  const [invoiceErr, setInvoiceErr] = useState<string | null>(null);

  // inventory settings
  const [threshold, setThreshold] = useState(String(workspace?.settings.low_stock_threshold ?? 5));
  const [autoSku, setAutoSku] = useState(workspace?.settings.auto_sku ?? true);
  const [allowNegative, setAllowNegative] = useState(workspace?.settings.allow_negative_stock ?? false);
  const [enableVariants, setEnableVariants] = useState(workspace?.settings.enable_variants ?? false);
  const [invMsg, setInvMsg] = useState<string | null>(null);

  // attribute form
  const [attrSheetOpen, setAttrSheetOpen] = useState(false);
  const [editingAttr, setEditingAttr] = useState<AttributeDef | null>(null);
  const [attrName, setAttrName] = useState("");
  const [attrType, setAttrType] = useState<AttributeDef["field_type"]>("text");
  const [attrOptions, setAttrOptions] = useState("");
  const [attrRequired, setAttrRequired] = useState(false);
  const [attrErr, setAttrErr] = useState<string | null>(null);

  // password
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  const [logoutOpen, setLogoutOpen] = useState(false);

  const { data: attrData, isLoading: attrLoading, isError: attrError, refetch: attrRefetch } = useQuery({
    queryKey: ["attributes", wid],
    queryFn: () => get<{ attributes: AttributeDef[] }>(`/workspaces/${wid}/attributes`),
    enabled: !!wid && section === "attributes",
  });

  const saveProfile = useMutation({
    mutationFn: () =>
      patch(`/workspaces/${wid}`, {
        name, phone: phone || null, email: email || null, address: address || null,
        currency,
        business_type: businessTypes[0] ?? "general",
        business_types: businessTypes,
      }),
    onSuccess: async () => {
      await refreshWorkspace();
      setProfileMsg("Saved"); setProfileErr(null);
      setTimeout(() => setProfileMsg(null), 2000);
    },
    onError: (e) => setProfileErr(e instanceof Error ? e.message : "Save failed"),
  });

  const saveInvoice = useMutation({
    mutationFn: () =>
      patch(`/workspaces/${wid}`, {
        invoice_prefix: invoicePrefix || "INV",
        invoice_title: invoiceTitle.trim() || null,
        gstin: gstin.trim() || null,
        invoice_footer: invoiceFooter.trim() || null,
        invoice_terms: invoiceTerms.trim() || null,
        invoice_show_logo: showLogo,
        invoice_show_address: showAddress,
        invoice_show_phone: showPhone,
        invoice_show_gstin: showGstin,
        invoice_show_sku: showSku,
      }),
    onSuccess: async () => {
      await refreshWorkspace();
      setInvoiceMsg("Saved"); setInvoiceErr(null);
      setTimeout(() => setInvoiceMsg(null), 2000);
    },
    onError: (e) => setInvoiceErr(e instanceof Error ? e.message : "Save failed"),
  });

  const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

  async function uploadLogo(file: File) {
    if (!wid) return;
    setLogoErr(null); setLogoMsg(null);
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      setLogoErr("Choose a PNG, JPG, WebP or GIF image");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoErr("Logo must be smaller than 2 MB");
      return;
    }
    setLogoBusy(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read that image"));
        reader.readAsDataURL(file);
      });
      const uploaded = await post<{ file_url: string }>(`/workspaces/${wid}/files`, {
        filename: file.name, mime_type: file.type, data,
      });
      await patch(`/workspaces/${wid}`, { logo_url: uploaded.file_url });
      setLogoUrl(uploaded.file_url);
      await refreshWorkspace();
      setLogoMsg("Logo updated");
      setTimeout(() => setLogoMsg(null), 2000);
    } catch (e) {
      setLogoErr(e instanceof Error ? e.message : "Logo upload failed");
    } finally {
      setLogoBusy(false);
    }
  }

  async function removeLogo() {
    if (!wid) return;
    setLogoErr(null); setLogoMsg(null);
    setLogoBusy(true);
    try {
      await patch(`/workspaces/${wid}`, { logo_url: null });
      setLogoUrl(null);
      await refreshWorkspace();
      setLogoMsg("Logo removed");
      setTimeout(() => setLogoMsg(null), 2000);
    } catch (e) {
      setLogoErr(e instanceof Error ? e.message : "Could not remove logo");
    } finally {
      setLogoBusy(false);
    }
  }

  const saveInventorySettings = useMutation({
    mutationFn: () =>
      patch(`/workspaces/${wid}/settings`, {
        low_stock_threshold: parseInt(threshold || "5", 10),
        auto_sku: autoSku,
        allow_negative_stock: allowNegative,
        enable_variants: enableVariants,
      }),
    onSuccess: async () => {
      await refreshWorkspace();
      setInvMsg("Saved");
      setTimeout(() => setInvMsg(null), 2000);
    },
    onError: (e) => setInvMsg(e instanceof Error ? e.message : "Save failed"),
  });

  const toggleModule = useMutation({
    mutationFn: (p: { module_key: string; enabled: boolean }) =>
      patch(`/workspaces/${wid}/modules`, p),
    onSuccess: async () => {
      await refreshWorkspace();
    },
  });

  const saveAttr = useMutation({
    mutationFn: () => {
      const payload = {
        name: attrName,
        field_type: attrType,
        required: attrRequired,
        ...(attrType === "dropdown" ? { options: attrOptions.split(",").map((s) => s.trim()).filter(Boolean) } : {}),
      };
      return editingAttr
        ? patch(`/workspaces/${wid}/attributes/${editingAttr.id}`, payload)
        : post(`/workspaces/${wid}/attributes`, payload);
    },
    onSuccess: () => { void qc.invalidateQueries(); setAttrSheetOpen(false); },
    onError: (e) => setAttrErr(e instanceof Error ? e.message : "Save failed"),
  });

  const deleteAttr = useMutation({
    mutationFn: (id: string) => patch(`/workspaces/${wid}/attributes/${id}`, { is_active: false }),
    onSuccess: () => void qc.invalidateQueries(),
  });

  const changePw = useMutation({
    mutationFn: () => post("/auth/change-password", { current_password: currentPw, new_password: newPw }),
    onSuccess: () => { setPwMsg("Password updated"); setPwErr(null); setCurrentPw(""); setNewPw(""); },
    onError: (e) => setPwErr(e instanceof Error ? e.message : "Could not update password"),
  });

  if (!workspace) return <ErrorState />;

  const w = workspace.workspace;
  const savedTypes = businessTypesOf(w);
  const typesDirty =
    businessTypes.length !== savedTypes.length || businessTypes.some((t) => !savedTypes.includes(t));
  const profileDirty =
    name !== w.name || phone !== (w.phone ?? "") || email !== (w.email ?? "") ||
    address !== (w.address ?? "") || currency !== w.currency || typesDirty;

  function toggleBusinessType(value: string) {
    setBusinessTypes((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value]
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <h1 className="font-display text-xl font-bold">Settings</h1>

      <div className="flex gap-1 overflow-x-auto rounded-md bg-background-2 p-1">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap rounded px-3 py-2 text-xs font-medium transition-colors",
              section === s.id ? "bg-surface shadow-xs" : "text-muted-foreground"
            )}
          >
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {/* Business profile */}
      {section === "profile" && (
        <Card>
          <CardBody className="space-y-4 pt-4">
            <div className="flex items-center gap-4">
              <WorkspaceLogo name={name || "EVOLV"} logoUrl={logoUrl} size={64} className="rounded-xl shadow-sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Business logo</p>
                <p className="text-2xs leading-relaxed text-muted-foreground">
                  Used in the app header, workspace switcher and your invoices.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    ref={logoInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void uploadLogo(file);
                    }}
                  />
                  <Button
                    type="button" size="sm" variant="secondary" loading={logoBusy}
                    onClick={() => logoInput.current?.click()}
                  >
                    <Upload size={14} /> {logoUrl ? "Replace" : "Upload logo"}
                  </Button>
                  {logoUrl && (
                    <Button type="button" size="sm" variant="ghost" disabled={logoBusy} onClick={() => void removeLogo()}>
                      <Trash2 size={14} /> Remove
                    </Button>
                  )}
                </div>
                <p className="mt-1.5 text-2xs text-muted-foreground">PNG, JPG, WebP or GIF · up to 2 MB</p>
                {logoMsg && <p className="mt-1 text-xs text-success">{logoMsg}</p>}
                {logoErr && <p className="mt-1 text-xs text-danger">{logoErr}</p>}
              </div>
            </div>
            <div className="border-t border-line" />
            <Field label="Business name">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </Field>
            <Field label="Business sections" hint="Choose every section that fits — you can mix bags, eyewear and more">
              <div className="grid grid-cols-2 gap-2">
                {BUSINESS_TYPES.map((t) => {
                  const selected = businessTypes.includes(t.value);
                  return (
                    <button
                      key={t.value} type="button" onClick={() => toggleBusinessType(t.value)}
                      aria-pressed={selected}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-md border p-2.5 text-left text-xs font-medium transition-colors",
                        selected ? "border-accent bg-champagne-light/40 text-accent" : "border-line bg-surface"
                      )}
                    >
                      <span>{t.label}</span>
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                          selected ? "border-accent bg-accent text-white" : "border-line"
                        )}
                      >
                        {selected && <Check size={10} strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })}
              </div>
              {businessTypes.length === 0 && (
                <p className="mt-1.5 text-2xs text-danger">Pick at least one section.</p>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Currency">
                <select
                  value={currency} onChange={(e) => setCurrency(e.target.value)}
                  className="h-11 w-full rounded-md border border-line bg-surface px-3 text-base focus:border-champagne focus:outline-none"
                >
                  {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Phone">
                <Input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
            </div>
            <Field label="Email" optional>
              <Input inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Address" optional>
              <Textarea value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
            {profileErr && <p className="text-sm text-danger">{profileErr}</p>}
            <div className="flex items-center gap-3">
              <Button loading={saveProfile.isPending} disabled={!profileDirty || businessTypes.length === 0} onClick={() => { if (name.trim()) saveProfile.mutate(); }}>
                Save changes
              </Button>
              {profileMsg && <span className="text-xs text-success">{profileMsg}</span>}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Modules */}
      {section === "customize" && (
        <Card>
          <CardBody className="pt-4">
            <p className="mb-3 text-xs text-muted-foreground">
              Turn modules on or off. Dashboard and Inventory are always on. Your data is kept when you disable a module.
            </p>
            <div className="space-y-2">
              {Object.keys(MODULE_LABELS).map((m) => {
                const core = CORE_MODULES.includes(m);
                const enabled = core || modules[m];
                const pending = toggleModule.isPending && toggleModule.variables?.module_key === m;
                return (
                  <label key={m} className="flex items-center justify-between rounded-md border border-line p-3.5">
                    <div>
                      <p className="text-sm font-medium">{MODULE_LABELS[m]}</p>
                      {core && <p className="text-2xs text-muted-foreground">Core module</p>}
                    </div>
                    <input
                      type="checkbox"
                      checked={enabled}
                      disabled={core || pending}
                      onChange={(e) => toggleModule.mutate({ module_key: m, enabled: e.target.checked })}
                      className="h-5 w-5 accent-[#a37e35]"
                    />
                  </label>
                );
              })}
            </div>
            {toggleModule.isError && (
              <p className="mt-3 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
                {toggleModule.error instanceof Error ? toggleModule.error.message : "Could not update module"}
              </p>
            )}
          </CardBody>
        </Card>
      )}

      {/* Product attributes */}
      {section === "attributes" && (
        <Card>
          <CardBody className="pt-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Add your own fields to products — like size, material or warranty.</p>
              <Button size="sm" variant="secondary" onClick={() => { setEditingAttr(null); setAttrName(""); setAttrType("text"); setAttrOptions(""); setAttrRequired(false); setAttrErr(null); setAttrSheetOpen(true); }}>
                <Plus size={14} /> Add
              </Button>
            </div>
            {attrLoading ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : attrError ? (
              <ErrorState onRetry={() => void attrRefetch()} />
            ) : !attrData || attrData.attributes.filter((a) => a.is_active).length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">No custom fields yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {attrData.attributes.filter((a) => a.is_active).map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-medium">{a.name}</p>
                      <p className="text-2xs capitalize text-muted-foreground">
                        {a.field_type}{a.required ? " · required" : ""}{a.field_type === "dropdown" ? ` · ${a.options.length} options` : ""}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => { setEditingAttr(a); setAttrName(a.name); setAttrType(a.field_type); setAttrOptions(a.options.join(", ")); setAttrRequired(a.required); setAttrErr(null); setAttrSheetOpen(true); }}
                        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-background-2"
                      >
                        <SlidersHorizontal size={14} />
                      </button>
                      <button
                        onClick={() => deleteAttr.mutate(a.id)}
                        className="flex h-9 w-9 items-center justify-center rounded-md text-danger hover:bg-background-2"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      {/* Inventory */}
      {section === "inventory" && (
        <Card>
          <CardBody className="space-y-4 pt-4">
            <Field label="Low-stock alert level" hint="Products at or below this quantity are flagged">
              <Input inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value.replace(/\D/g, ""))} className="tabular" />
            </Field>
            <label className="flex items-center justify-between rounded-md border border-line p-3.5 text-sm">
              <span>Auto-generate SKUs</span>
              <input type="checkbox" checked={autoSku} onChange={(e) => setAutoSku(e.target.checked)} className="h-5 w-5 accent-[#a37e35]" />
            </label>
            <label className="flex items-center justify-between rounded-md border border-line p-3.5 text-sm">
              <div>
                <p>Allow sales when stock runs out</p>
                <p className="text-2xs text-muted-foreground">Turn on if you sometimes sell before updating stock</p>
              </div>
              <input type="checkbox" checked={allowNegative} onChange={(e) => setAllowNegative(e.target.checked)} className="h-5 w-5 accent-[#a37e35]" />
            </label>
            <label className="flex items-center justify-between rounded-md border border-line p-3.5 text-sm">
              <div>
                <p>Product variants</p>
                <p className="text-2xs text-muted-foreground">Track colour / size options separately</p>
              </div>
              <input type="checkbox" checked={enableVariants} onChange={(e) => setEnableVariants(e.target.checked)} className="h-5 w-5 accent-[#a37e35]" />
            </label>
            {invMsg && <span className="text-xs text-success">{invMsg}</span>}
            <Button loading={saveInventorySettings.isPending} onClick={() => saveInventorySettings.mutate()}>
              Save
            </Button>
          </CardBody>
        </Card>
      )}

      {/* Invoice */}
      {section === "invoice" && (
        <Card>
          <CardBody className="space-y-4 pt-4">
            <div className="flex items-center gap-3 rounded-md border border-line bg-background-2/50 p-3">
              <WorkspaceLogo name={name || "EVOLV"} logoUrl={showLogo ? logoUrl : null} size={40} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{invoiceTitle.trim() || "Invoice"}</p>
                <p className="text-2xs text-muted-foreground">Live preview of the invoice header</p>
              </div>
            </div>

            <Field label="Invoice title" hint="e.g. Tax Invoice, Bill of Supply — leave blank for “Invoice”">
              <Input value={invoiceTitle} onChange={(e) => setInvoiceTitle(e.target.value)} maxLength={60} placeholder="Invoice" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Invoice prefix" hint="e.g. INV gives INV-00001">
                <Input value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())} maxLength={10} className="tabular" />
              </Field>
              <Field label="GSTIN" optional>
                <Input value={gstin} onChange={(e) => setGstin(e.target.value)} maxLength={20} />
              </Field>
            </div>

            <Field label="Terms & notes" optional hint="Exchange policy, payment terms or a short note — shown above the footer">
              <Textarea value={invoiceTerms} onChange={(e) => setInvoiceTerms(e.target.value)} maxLength={500} placeholder="e.g. Exchange within 7 days with the original bill." />
            </Field>

            <Field label="Footer message" optional>
              <Textarea value={invoiceFooter} onChange={(e) => setInvoiceFooter(e.target.value)} maxLength={300} placeholder="e.g. Thank you for your business!" />
            </Field>

            <div>
              <p className="mb-2 text-sm font-medium">Show on invoice</p>
              <div className="space-y-2">
                {[
                  { label: "Business logo", checked: showLogo && !!logoUrl, onChange: setShowLogo, disabled: !logoUrl },
                  { label: "Business address", checked: showAddress, onChange: setShowAddress },
                  { label: "Phone number", checked: showPhone, onChange: setShowPhone },
                  { label: "GSTIN", checked: showGstin, onChange: setShowGstin },
                  { label: "Product SKU", checked: showSku, onChange: setShowSku },
                ].map((opt) => (
                  <label
                    key={opt.label}
                    className={cn(
                      "flex items-center justify-between rounded-md border border-line p-3 text-sm",
                      opt.disabled && "opacity-50"
                    )}
                  >
                    <span>
                      {opt.label}
                      {opt.disabled && <span className="ml-1.5 text-2xs text-muted-foreground">Upload a logo first</span>}
                    </span>
                    <input
                      type="checkbox"
                      checked={opt.checked}
                      disabled={opt.disabled}
                      onChange={(e) => opt.onChange(e.target.checked)}
                      className="h-5 w-5 accent-[#a37e35]"
                    />
                  </label>
                ))}
              </div>
            </div>

            {invoiceErr && <p className="text-xs text-danger">{invoiceErr}</p>}
            <div className="flex items-center gap-3">
              <Button loading={saveInvoice.isPending} onClick={() => saveInvoice.mutate()}>Save</Button>
              {invoiceMsg && <span className="text-xs text-success">{invoiceMsg}</span>}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Account */}
      {section === "account" && (
        <div className="space-y-4">
          <Card>
            <CardBody className="pt-4">
              <p className="text-sm font-medium">{user.name || "Your account"}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="space-y-4 pt-4">
              <p className="text-sm font-semibold">Change password</p>
              <Field label="Current password">
                <Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} autoComplete="current-password" />
              </Field>
              <Field label="New password" hint="At least 8 characters">
                <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
              </Field>
              {pwMsg && <p className="text-xs text-success">{pwMsg}</p>}
              {pwErr && <p className="text-xs text-danger">{pwErr}</p>}
              <Button
                loading={changePw.isPending}
                onClick={() => {
                  setPwErr(null);
                  if (newPw.length < 8) return setPwErr("New password must be at least 8 characters");
                  changePw.mutate();
                }}
              >
                Update password
              </Button>
            </CardBody>
          </Card>
          <button
            onClick={() => setLogoutOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-line bg-surface py-3 text-sm font-medium text-danger hover:bg-danger/5"
          >
            <LogOut size={16} /> Log out
          </button>
        </div>
      )}

      {/* Attribute sheet */}
      <Sheet open={attrSheetOpen} onClose={() => setAttrSheetOpen(false)} title={editingAttr ? "Edit field" : "Add product field"}>
        <div className="space-y-4">
          <Field label="Field name">
            <Input value={attrName} onChange={(e) => setAttrName(e.target.value)} autoFocus placeholder="e.g. Frame material" />
          </Field>
          <Field label="Field type">
            <div className="grid grid-cols-4 gap-2">
              {(["text", "number", "dropdown", "boolean"] as const).map((t) => (
                <button
                  key={t} type="button" onClick={() => setAttrType(t)}
                  className={cn(
                    "rounded-md border p-2.5 text-xs font-medium capitalize transition-colors",
                    attrType === t ? "border-accent bg-champagne-light/40 text-accent" : "border-line bg-surface"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>
          {attrType === "dropdown" && (
            <Field label="Options" hint="Separate with commas">
              <Input value={attrOptions} onChange={(e) => setAttrOptions(e.target.value)} placeholder="Metal, Plastic, Wood" />
            </Field>
          )}
          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" checked={attrRequired} onChange={(e) => setAttrRequired(e.target.checked)} className="h-5 w-5 accent-[#a37e35]" />
            Required on every product
          </label>
          {attrErr && <p className="text-sm text-danger">{attrErr}</p>}
          <Button
            className="w-full" size="lg" loading={saveAttr.isPending}
            onClick={() => {
              setAttrErr(null);
              if (!attrName.trim()) return setAttrErr("Field name is required");
              if (attrType === "dropdown" && !attrOptions.trim()) return setAttrErr("Add at least one option");
              saveAttr.mutate();
            }}
          >
            {editingAttr ? "Save changes" : "Add field"}
          </Button>
        </div>
      </Sheet>

      <ConfirmDialog
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        onConfirm={() => void logout().then(() => navigate("/login"))}
        title="Log out?"
        message="You'll need to sign in again to access your workspace."
        confirmLabel="Log out"
        danger
      />
    </div>
  );
}
