import { useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, Package, ShoppingCart, ShoppingCart as Cart, Settings, MoreHorizontal,
  Truck, Tags, BarChart3, SlidersHorizontal, LogOut, Store, Menu, X,
} from "lucide-react";
import { useSession } from "@/providers/session";
import { businessTypesLabel } from "@/types";
import { cn } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { WorkspaceLogo } from "@/components/ui/workspace-logo";

type NavItem = { to: string; label: string; icon: React.ReactNode; module: string; primary?: boolean };

function useNavItems(): { primary: NavItem[]; more: NavItem[] } {
  const { modules } = useSession();
  const all: NavItem[] = [
    { to: "/app/dashboard", label: "Home", icon: <Home size={20} />, module: "dashboard", primary: true },
    { to: "/app/inventory", label: "Inventory", icon: <Package size={20} />, module: "inventory", primary: true },
    { to: "/app/sales", label: "Sales", icon: <ShoppingCart size={20} />, module: "sales", primary: true },
    { to: "/app/settings", label: "Settings", icon: <Settings size={20} />, module: "settings", primary: true },
    { to: "/app/purchases", label: "Purchases", icon: <Truck size={20} />, module: "purchases" },
    { to: "/app/suppliers", label: "Suppliers", icon: <Store size={20} />, module: "suppliers" },
    { to: "/app/categories", label: "Categories", icon: <Tags size={20} />, module: "categories" },
    { to: "/app/reports", label: "Reports", icon: <BarChart3 size={20} />, module: "reports" },
    { to: "/app/adjustments", label: "Adjustments", icon: <SlidersHorizontal size={20} />, module: "adjustments" },
  ];
  const enabled = all.filter((i) => modules[i.module] ?? i.module === "settings");
  return {
    primary: enabled.filter((i) => i.primary).slice(0, 4),
    more: enabled.filter((i) => !i.primary),
  };
}

function NavLinks({ items, onNavigate, wide }: { items: NavItem[]; onNavigate?: () => void; wide?: boolean }) {
  return (
    <>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              wide
                ? "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors"
                : "flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium",
              wide
                ? isActive
                  ? "bg-background-2 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-background-2/60"
                : isActive
                  ? "text-accent"
                  : "text-muted-foreground"
            )
          }
        >
          {item.icon}
          <span>{item.label}</span>
        </NavLink>
      ))}
    </>
  );
}

export function AppLayout() {
  const { workspace, workspaces, activeId, setActiveId, logout } = useSession();
  const { primary, more } = useNavItems();
  const [moreOpen, setMoreOpen] = useState(false);
  const [wsOpen, setWsOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface px-3 py-4 md:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <WorkspaceLogo
            name={workspace?.workspace.name ?? "EVOLV"}
            logoUrl={workspace?.workspace.logo_url}
            size={32}
            className="shadow-sm"
          />
          <div className="min-w-0 flex-1">
            <button
              onClick={() => setWsOpen(true)}
              className="block w-full truncate text-left font-display text-sm font-bold text-foreground hover:text-accent"
            >
              {workspace?.workspace.name ?? "EVOLV"}
            </button>
            <p className="text-2xs text-muted-foreground">Powered by EVOLV</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          <NavLinks items={[...primary.filter((i) => i.to !== "/app/settings"), ...more]} wide />
        </nav>
        <div className="border-t border-line pt-2">
          <NavLinks items={primary.filter((i) => i.to === "/app/settings")} wide />
          <button
            onClick={() => void logout().then(() => navigate("/login"))}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-background-2 hover:text-danger"
          >
            <LogOut size={18} />
            Log out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-background/95 px-4 py-3 backdrop-blur md:hidden pt-safe">
        <button onClick={() => setWsOpen(true)} className="flex min-w-0 items-center gap-2.5 text-left">
          <WorkspaceLogo
            name={workspace?.workspace.name ?? "EVOLV"}
            logoUrl={workspace?.workspace.logo_url}
            size={32}
            className="shadow-sm"
          />
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-bold">{workspace?.workspace.name ?? "EVOLV"}</p>
            <p className="text-2xs text-muted-foreground">Powered by EVOLV</p>
          </div>
        </button>
        {more.length > 0 && (
          <button
            onClick={() => setMoreOpen(true)}
            aria-label="More"
            className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-background-2"
          >
            <Menu size={20} />
          </button>
        )}
      </header>

      {/* Main content */}
      <main className="pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0 md:pl-60">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6 sm:py-6">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur md:hidden pb-safe">
        <div className="grid grid-cols-4">
          <NavLinks items={primary} />
        </div>
      </nav>

      {/* More sheet (mobile) */}
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="grid grid-cols-2 gap-2">
          {more.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMoreOpen(false)}
              className="flex flex-col items-start gap-2 rounded-md border border-line bg-surface p-3.5 text-sm font-medium hover:bg-background-2"
            >
              <span className="text-accent">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </Sheet>

      {/* Workspace switcher */}
      <Sheet open={wsOpen} onClose={() => setWsOpen(false)} title="Your businesses">
        <div className="space-y-2">
          {workspaces.map((w) => (
            <button
              key={w.id}
              onClick={() => {
                setActiveId(w.id);
                setWsOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-md border p-3.5 text-left",
                w.id === activeId ? "border-accent bg-champagne-light/40" : "border-line hover:bg-background-2"
              )}
            >
              <WorkspaceLogo
                name={w.name}
                logoUrl={w.id === activeId ? (workspace?.workspace.logo_url ?? w.logo_url) : w.logo_url}
                size={40}
                className="shadow-sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{w.name}</p>
                <p className="truncate text-2xs text-muted-foreground">{businessTypesLabel(w)}</p>
              </div>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

export function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background-2 px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-charcoal shadow-md">
            <span
              aria-hidden
              className="absolute inset-x-0 top-0 h-px"
              style={{ background: "linear-gradient(90deg, transparent, #d8b565aa, transparent)" }}
            />
            <span className="font-display text-2xl font-semibold text-gold">E</span>
          </div>
          <div className="text-center">
            <h1 className="font-display text-xl font-semibold tracking-[0.22em] text-foreground">EVOLV</h1>
            <p className="eyebrow mt-1 text-muted-foreground">One platform. Your business.</p>
          </div>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
