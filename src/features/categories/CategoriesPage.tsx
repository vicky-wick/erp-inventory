import { useState, FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, del } from "@/lib/api";
import { useSession } from "@/providers/session";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/card";
import { Sheet, ConfirmDialog } from "@/components/ui/sheet";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Plus, Tags, Pencil, Trash2 } from "lucide-react";
import { CATEGORY_SUGGESTIONS, businessTypesOf, type Category } from "@/types";

export default function CategoriesPage() {
  const { workspace } = useSession();
  const qc = useQueryClient();
  const wid = workspace?.workspace.id;
  const businessTypes = workspace ? businessTypesOf(workspace.workspace) : ["general"];

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["categories", wid],
    queryFn: () => get<{ categories: Category[] }>(`/workspaces/${wid}/categories`),
    enabled: !!wid,
  });

  const save = useMutation({
    mutationFn: () =>
      editing
        ? patch(`/workspaces/${wid}/categories/${editing.id}`, { name, description: description || null })
        : post(`/workspaces/${wid}/categories`, { name, description: description || null }),
    onSuccess: () => { void qc.invalidateQueries(); setSheetOpen(false); },
    onError: (e) => setError(e instanceof Error ? e.message : "Save failed"),
  });

  const remove = useMutation({
    mutationFn: () => del(`/workspaces/${wid}/categories/${deleteTarget!.id}`),
    onSuccess: () => { void qc.invalidateQueries(); setDeleteTarget(null); },
    onError: (e) => setError(e instanceof Error ? e.message : "Delete failed"),
  });

  const existing = new Set((data?.categories ?? []).map((c) => c.name.toLowerCase()));
  // Merge suggestions from every section the shop belongs to, in the order the
  // sections were chosen, so a bags + eyewear shop sees both sets.
  const ideas = Array.from(
    new Set(businessTypes.flatMap((t) => CATEGORY_SUGGESTIONS[t] ?? []))
  ).filter((s) => !existing.has(s.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold">Categories</h1>
        <Button size="sm" onClick={() => { setEditing(null); setName(""); setDescription(""); setError(null); setSheetOpen(true); }}>
          <Plus size={16} /> Add
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2.5">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : !data || data.categories.length === 0 ? (
        <EmptyState
          icon={<Tags size={24} />}
          title="No categories yet"
          message="Categories keep your product list organised. Add a few that match what you sell."
        />
      ) : (
        <ul className="space-y-2">
          {data.categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between rounded-lg border border-line bg-surface p-3.5 shadow-xs">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{c.name}</p>
                <p className="text-2xs text-muted-foreground">{c.product_count} products</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => { setEditing(c); setName(c.name); setDescription(c.description ?? ""); setError(null); setSheetOpen(true); }}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-background-2"
                  aria-label="Edit"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => setDeleteTarget(c)}
                  disabled={c.product_count > 0}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-danger disabled:opacity-30"
                  aria-label="Delete"
                  title={c.product_count > 0 ? "Reassign its products first" : "Delete"}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {ideas.length > 0 && (
        <div className="rounded-lg border border-line bg-surface p-4 shadow-xs">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Suggested for your shop:
          </p>
          <div className="flex flex-wrap gap-2">
            {ideas.map((s) => (
              <button
                key={s}
                onClick={() => post(`/workspaces/${wid}/categories`, { name: s }).then(() => qc.invalidateQueries())}
                className="rounded-full border border-dashed border-line px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-accent hover:text-accent"
              >
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={editing ? "Edit category" : "Add category"}>
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); setError(null); if (!name.trim()) return setError("Name is required"); save.mutate(); }} className="space-y-4">
          <Field label="Category name">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Sunglasses" />
          </Field>
          <Field label="Description" optional>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" className="w-full" size="lg" loading={save.isPending}>
            {editing ? "Save changes" : "Add category"}
          </Button>
        </form>
      </Sheet>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => remove.mutate()}
        title={`Delete "${deleteTarget?.name}"?`}
        message="Only unused categories can be deleted. Products keep their other details."
        confirmLabel="Delete"
        danger
        loading={remove.isPending}
      />
    </div>
  );
}
