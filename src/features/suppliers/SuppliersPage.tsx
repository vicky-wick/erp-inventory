import { useState, FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch } from "@/lib/api";
import { useSession } from "@/providers/session";
import { Input, Field } from "@/components/ui/input";
import { Card, CardBody, Badge, Skeleton } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Plus, Store, Pencil } from "lucide-react";
import type { Supplier } from "@/types";

export default function SuppliersPage() {
  const { workspace } = useSession();
  const qc = useQueryClient();
  const wid = workspace?.workspace.id;

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["suppliers", wid],
    queryFn: () => get<{ suppliers: Supplier[] }>(`/workspaces/${wid}/suppliers`),
    enabled: !!wid,
  });

  function openNew() {
    setEditing(null); setName(""); setPhone(""); setEmail(""); setAddress(""); setNotes(""); setError(null);
    setSheetOpen(true);
  }
  function openEdit(s: Supplier) {
    setEditing(s); setName(s.name); setPhone(s.phone ?? ""); setEmail(s.email ?? "");
    setAddress(s.address ?? ""); setNotes(s.notes ?? ""); setError(null);
    setSheetOpen(true);
  }

  const save = useMutation({
    mutationFn: () => {
      const payload = { name, phone: phone || null, email: email || null, address: address || null, notes: notes || null };
      return editing
        ? patch(`/workspaces/${wid}/suppliers/${editing.id}`, payload)
        : post(`/workspaces/${wid}/suppliers`, payload);
    },
    onSuccess: () => {
      void qc.invalidateQueries();
      setSheetOpen(false);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Save failed"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold">Suppliers</h1>
        <Button size="sm" onClick={openNew}><Plus size={16} /> Add</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2.5">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : !data || data.suppliers.length === 0 ? (
        <EmptyState
          icon={<Store size={24} />}
          title="No suppliers yet"
          message="Add suppliers to track where your products come from."
          action={<Button onClick={openNew}><Plus size={16} /> Add supplier</Button>}
        />
      ) : (
        <ul className="space-y-2">
          {data.suppliers.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => openEdit(s)}
                className="flex w-full items-center justify-between rounded-lg border border-line bg-surface p-3.5 text-left shadow-xs hover:shadow-sm"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{s.name}</p>
                  <p className="text-2xs text-muted-foreground">
                    {s.phone || "No phone"} · {s.product_count} products · {s.purchase_count} purchases
                  </p>
                </div>
                <Pencil size={15} className="shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={editing ? "Edit supplier" : "Add supplier"}>
        <form
          onSubmit={(e: FormEvent) => { e.preventDefault(); setError(null); if (!name.trim()) return setError("Supplier name is required"); save.mutate(); }}
          className="space-y-4"
        >
          <Field label="Supplier name">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" optional>
              <Input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Email" optional>
              <Input inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          </div>
          <Field label="Address" optional>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <Field label="Notes" optional>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" className="w-full" size="lg" loading={save.isPending}>
            {editing ? "Save changes" : "Add supplier"}
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
