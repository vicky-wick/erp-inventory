import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { get, post, setToken, clearToken, getToken, ApiError } from "@/lib/api";
import type { AuthUser, WorkspaceSummary, WorkspaceFull, ModuleMap, DashboardData } from "@/types";

type BootResponse = {
  user: AuthUser;
  workspaces: WorkspaceSummary[];
  workspace: WorkspaceFull | null;
  dashboard: DashboardData | null;
};

type Session = {
  user: AuthUser;
  workspaces: WorkspaceSummary[];
  activeId: string | null;
  setActiveId: (id: string) => void;
  workspace: WorkspaceFull | null;
  modules: ModuleMap;
  loading: boolean;
  refreshMe: () => Promise<void>;
  refreshWorkspace: () => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<Session>(null as unknown as Session);

export function useSession() {
  return useContext(Ctx);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(
    () => localStorage.getItem("evolv.workspace")
  );
  const [workspace, setWorkspace] = useState<WorkspaceFull | null>(null);
  const [loading, setLoading] = useState(true);
  const workspaceLoaded = useRef(false);

  const refreshMe = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setWorkspaces([]);
      setLoading(false);
      return;
    }
    try {
      // One request for user + workspaces + active workspace + dashboard.
      const stored = localStorage.getItem("evolv.workspace");
      const data = await get<BootResponse>(
        `/auth/boot${stored ? `?workspace=${encodeURIComponent(stored)}` : ""}`
      );
      setUser(data.user);
      setWorkspaces(data.workspaces);
      let chosen: string | null = null;
      setActiveIdState((cur) => {
        const valid = cur && data.workspaces.some((w) => w.id === cur);
        chosen = valid ? cur : (data.workspaces[0]?.id ?? null);
        if (chosen !== cur) localStorage.setItem("evolv.workspace", chosen ?? "");
        return chosen;
      });
      if (data.workspace && stored && data.workspace.workspace.id === stored) {
        workspaceLoaded.current = true;
        setWorkspace(data.workspace);
        // Seed the dashboard cache so the first paint needs no extra request.
        if (data.dashboard) qc.setQueryData(["dashboard", stored, 7], data.dashboard);
      } else if (chosen && chosen !== stored) {
        // The stored id was stale — load the workspace we actually picked.
        void refreshWorkspace();
      } else if (data.workspaces.length === 0) {
        setWorkspace(null);
      }
    } catch (err) {
      // Only a real auth rejection clears the session; transient network
      // errors should not log the user out mid-session.
      if (err instanceof ApiError && err.status === 401) {
        clearToken();
        setUser(null);
        setWorkspaces([]);
      }
    } finally {
      setLoading(false);
    }
  }, [qc]);

  const refreshWorkspace = useCallback(async () => {
    const id = localStorage.getItem("evolv.workspace");
    if (!id) {
      setWorkspace(null);
      return;
    }
    try {
      const data = await get<WorkspaceFull>(`/workspaces/${id}`);
      workspaceLoaded.current = true;
      setWorkspace(data);
    } catch (err) {
      // Keep prior data on transient failures; only give up on real auth errors.
      if (err instanceof ApiError && err.status === 401) {
        setWorkspace(null);
      } else if (!workspaceLoaded.current) {
        // No cached copy — retry once shortly after so boot never hangs.
        setTimeout(() => void refreshWorkspace(), 2000);
      }
    }
  }, []);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  useEffect(() => {
    void refreshWorkspace();
  }, [activeId, refreshWorkspace]);

  const setActiveId = useCallback((id: string) => {
    localStorage.setItem("evolv.workspace", id);
    workspaceLoaded.current = false;
    setActiveIdState(id);
  }, []);

  const logout = useCallback(async () => {
    try {
      await post("/auth/logout");
    } catch {
      /* token already invalid */
    }
    clearToken();
    localStorage.removeItem("evolv.workspace");
    setUser(null);
    setWorkspaces([]);
    setWorkspace(null);
    setActiveIdState(null);
  }, []);

  // Stable module map — consumers only re-render when modules actually change.
  const modules = useMemo<ModuleMap>(() => {
    const map: ModuleMap = {};
    for (const m of workspace?.modules ?? []) map[m.module_key] = m.enabled;
    return map;
  }, [workspace]);

  // Memoised context value: a state change no longer re-renders the whole tree.
  const value = useMemo<Session>(
    () => ({
      user: user as AuthUser,
      workspaces,
      activeId,
      setActiveId,
      workspace,
      modules,
      loading,
      refreshMe,
      refreshWorkspace,
      logout,
    }),
    [user, workspaces, activeId, workspace, modules, loading, setActiveId, refreshMe, refreshWorkspace, logout]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
