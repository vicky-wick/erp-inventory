import { lazy, Suspense, useEffect } from "react";
import { createBrowserRouter, RouterProvider, Outlet, Navigate, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider, useSession } from "@/providers/session";
import { AppLayout, AuthLayout } from "@/components/navigation/layouts";
import { FullPageLoader } from "@/components/ui/loaders";

// Route-level code splitting: each page loads on demand…
const LoginPage = lazy(() => import("@/features/auth/LoginPage"));
const RegisterPage = lazy(() => import("@/features/auth/RegisterPage"));
const ForgotPage = lazy(() => import("@/features/auth/ForgotPage"));
const OnboardingPage = lazy(() => import("@/features/onboarding/OnboardingPage"));
const LandingPage = lazy(() => import("@/features/landing/LandingPage"));
const DashboardPage = lazy(() => import("@/features/dashboard/DashboardPage"));
const InventoryPage = lazy(() => import("@/features/inventory/InventoryPage"));
const ProductNewPage = lazy(() => import("@/features/inventory/ProductNewPage"));
const ProductDetailPage = lazy(() => import("@/features/inventory/ProductDetailPage"));
const CategoriesPage = lazy(() => import("@/features/categories/CategoriesPage"));
const SalesPage = lazy(() => import("@/features/sales/SalesPage"));
const SaleNewPage = lazy(() => import("@/features/sales/SaleNewPage"));
const SaleDetailPage = lazy(() => import("@/features/sales/SaleDetailPage"));
const PurchasesPage = lazy(() => import("@/features/purchases/PurchasesPage"));
const PurchaseNewPage = lazy(() => import("@/features/purchases/PurchaseNewPage"));
const SuppliersPage = lazy(() => import("@/features/suppliers/SuppliersPage"));
const AdjustmentsPage = lazy(() => import("@/features/adjustments/AdjustmentsPage"));
const ReportsPage = lazy(() => import("@/features/reports/ReportsPage"));
const SettingsPage = lazy(() => import("@/features/settings/SettingsPage"));

// …but every chunk is tiny (8–31 kB), so we warm them all right after the
// first paint. Navigation then renders instantly with zero network wait.
const pageLoaders = [
  () => import("@/features/auth/LoginPage"),
  () => import("@/features/auth/RegisterPage"),
  () => import("@/features/auth/ForgotPage"),
  () => import("@/features/onboarding/OnboardingPage"),
  () => import("@/features/landing/LandingPage"),
  () => import("@/features/dashboard/DashboardPage"),
  () => import("@/features/inventory/InventoryPage"),
  () => import("@/features/inventory/ProductNewPage"),
  () => import("@/features/inventory/ProductDetailPage"),
  () => import("@/features/categories/CategoriesPage"),
  () => import("@/features/sales/SalesPage"),
  () => import("@/features/sales/SaleNewPage"),
  () => import("@/features/sales/SaleDetailPage"),
  () => import("@/features/purchases/PurchasesPage"),
  () => import("@/features/purchases/PurchaseNewPage"),
  () => import("@/features/suppliers/SuppliersPage"),
  () => import("@/features/adjustments/AdjustmentsPage"),
  () => import("@/features/reports/ReportsPage"),
  () => import("@/features/settings/SettingsPage"),
];

function RoutePreloader() {
  useEffect(() => {
    const warm = () => {
      for (const load of pageLoaders) void load().catch(() => {});
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
    if (typeof w.requestIdleCallback === "function") {
      w.requestIdleCallback(warm, { timeout: 2500 });
    } else {
      const t = setTimeout(warm, 1200);
      return () => clearTimeout(t);
    }
  }, []);
  return null;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // Navigating between pages reuses warm data instead of refetching —
      // mutations invalidate precisely what changed.
      staleTime: 120_000,
      gcTime: 15 * 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

/** Redirects based on auth + workspace state. */
function Gate({ needWorkspace = true, children }: { needWorkspace?: boolean; children: React.ReactNode }) {
  const { user, loading, workspaces, activeId } = useSession();
  const { pathname } = useLocation();
  if (loading) return <FullPageLoader />;
  if (!user) {
    // Auth pages and the landing page are reachable without an account;
    // app pages redirect to login.
    return needWorkspace ? <Navigate to="/login" replace /> : <>{children}</>;
  }
  // Signed in but no workspace yet — onboarding, from anywhere.
  if (workspaces.length === 0) {
    if (pathname === "/onboarding") return <>{children}</>;
    return <Navigate to="/onboarding" replace />;
  }
  if (needWorkspace) {
    if (!activeId) return <Navigate to="/onboarding" replace />;
    return <>{children}</>;
  }
  // Signed-in users never see auth pages or the landing page.
  return <Navigate to="/app/dashboard" replace />;
}

function RequireModule({ module, children }: { module: string; children: React.ReactNode }) {
  const { modules, workspace } = useSession();
  // Wait for the workspace (and its module list) before deciding.
  if (!workspace) return <FullPageLoader />;
  if (!modules[module]) return <Navigate to="/app/dashboard" replace />;
  return <>{children}</>;
}

const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    children: [
      { path: "/login", element: <Gate needWorkspace={false}><LoginPage /></Gate> },
      { path: "/register", element: <Gate needWorkspace={false}><RegisterPage /></Gate> },
      { path: "/forgot-password", element: <Gate needWorkspace={false}><ForgotPage /></Gate> },
    ],
  },
  { path: "/onboarding", element: <Gate needWorkspace><OnboardingPage /></Gate> },
  {
    path: "/app",
    element: (
      <Gate needWorkspace>
        <AppLayout />
      </Gate>
    ),
    children: [
      { index: true, element: <Navigate to="/app/dashboard" replace /> },
      { path: "dashboard", element: <DashboardPage /> },
      { path: "inventory", element: <InventoryPage /> },
      { path: "inventory/new", element: <ProductNewPage /> },
      { path: "inventory/:id", element: <ProductDetailPage /> },
      { path: "categories", element: <RequireModule module="categories"><CategoriesPage /></RequireModule> },
      { path: "sales", element: <RequireModule module="sales"><SalesPage /></RequireModule> },
      { path: "sales/new", element: <RequireModule module="sales"><SaleNewPage /></RequireModule> },
      { path: "sales/:id", element: <RequireModule module="sales"><SaleDetailPage /></RequireModule> },
      { path: "purchases", element: <RequireModule module="purchases"><PurchasesPage /></RequireModule> },
      { path: "purchases/new", element: <RequireModule module="purchases"><PurchaseNewPage /></RequireModule> },
      { path: "suppliers", element: <RequireModule module="suppliers"><SuppliersPage /></RequireModule> },
      { path: "adjustments", element: <RequireModule module="adjustments"><AdjustmentsPage /></RequireModule> },
      { path: "reports", element: <RequireModule module="reports"><ReportsPage /></RequireModule> },
      { path: "settings", element: <SettingsPage /> },
      { path: "*", element: <Navigate to="/app/dashboard" replace /> },
    ],
  },
  // Public landing page; signed-in users are redirected by Gate.
  { path: "/", element: <Gate needWorkspace={false}><LandingPage /></Gate> },
  { path: "*", element: <Navigate to="/" replace /> },
]);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <RoutePreloader />
        <Suspense fallback={<FullPageLoader />}>
          <RouterProvider router={router} />
        </Suspense>
      </SessionProvider>
    </QueryClientProvider>
  );
}
