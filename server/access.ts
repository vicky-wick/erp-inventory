import { ApiRequest, unauthorized, forbidden, notFound } from "./router.js";
import { scopedQuery } from "./db.js";

export type Membership = { workspaceId: string; role: "owner" | "admin" | "staff" };

/** Assert the caller is a member of the workspace and return their role. */
export async function requireMembership(req: ApiRequest, workspaceId: string): Promise<Membership> {
  if (!req.userId) throw unauthorized();
  // A malformed id (e.g. "undefined" from a stale client URL) should be a
  // clean 400, not a Postgres cast error surfacing as a 500.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId)) {
    throw notFound();
  }
  const rows = await scopedQuery<{ role: string }>(
    { userId: req.userId },
    `select role from workspace_members where workspace_id = $1 and user_id = $2`,
    [workspaceId, req.userId]
  );
  const role = rows[0]?.role;
  if (!role) throw forbidden("You do not have access to this workspace");
  return { workspaceId, role: role as Membership["role"] };
}

/** Assert admin/owner role. */
export function requireAdmin(role: Membership["role"]): void {
  if (role !== "owner" && role !== "admin") {
    throw forbidden("Only workspace admins can do this");
  }
}

/** Assert the caller owns a workspace-scoped record; returns the row. */
export async function ownedRow<T extends Record<string, unknown>>(
  req: ApiRequest,
  workspaceId: string,
  table: string,
  id: string
): Promise<T> {
  await requireMembership(req, workspaceId);
  const rows = await scopedQuery<T>(
    { userId: req.userId!, workspaceId },
    `select * from ${table} where id = $1 and workspace_id = $2`,
    [id, workspaceId]
  );
  if (!rows[0]) throw notFound();
  return rows[0];
}
