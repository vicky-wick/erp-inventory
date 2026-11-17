# EVOLV — Retail Management Platform

One platform. Your business. A mobile-first retail management web app for inventory, sales, purchases, and stock control. Built with React 19 + TypeScript + Vite + Tailwind on the front end and Node/Express-style API on Neon PostgreSQL with row-level security.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query, React Router 7, Framer Motion, Recharts |
| Backend | Node (`pg`), transaction-scoped RLS context, scrypt auth + opaque bearer sessions |
| Database | Neon PostgreSQL (RLS policies on every table, integer paise for money) |
| Deploy target | Vercel (serverless entry `api/[[...path]].ts`) |

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Configure the database — copy .env.example to .env and set DATABASE_URL
#    (your Neon pooled connection string)

# 3. Apply the schema + stock-engine functions
npm run db:migrate

# 4. Run locally (API :8787 + Vite :5173, proxied at /api)
npm run dev
```

Open http://localhost:5173 — register an account and follow the onboarding wizard.

## Architecture

### Database (`db/migrations/`)
- **20 tables**: profiles, sessions, workspaces, workspace_members, workspace_modules, workspace_settings, dashboard_preferences, categories, suppliers, products, product_variants, product_attribute_values, custom_attribute_definitions, sales, sale_items, purchases, purchase_items, stock_movements, files, password_resets.
- **Stock engine as DB functions** (concurrency-safe with `FOR UPDATE` row locks):
  `record_sale`, `return_sale`, `receive_purchase`, `reverse_purchase`, `adjust_stock`, `create_product`, `generate_sku`, `next_sequence`, `create_workspace`, `dashboard_stats`.
- **RLS on every table** — the API sets `app.user_id` / `app.workspace_id` per transaction (`server/db.ts` withTx); cross-workspace access is impossible even if application code has a bug.
- **Money is integer paise** everywhere — no floating-point currency math.

### Backend (`server/`)
- Route table (`router.ts`) with typed validators; runs on Node http locally (`dev.ts`) and Vercel serverless (`api/[[...path]].ts`).
- Auth: scrypt password hashing, opaque tokens stored hashed (SHA-256) in `sessions`; sliding 30-day expiry.
- Access control: `requireMembership` / `requireAdmin` on every workspace route, enforced *and* backed by RLS.

### Frontend (`src/`)
- Mobile-first design system: champagne/charcoal palette, Manrope display + Inter body, 4px spacing scale, `pb-safe` safe areas.
- App shell: mobile bottom nav + "more" sheet, desktop sidebar, workspace switcher.
- Route-level code splitting with per-page chunks and vendor splitting (`vendor-react`, `vendor-query`, `charts`, `motion`).
- Module-gated routes: modules toggle on/off at runtime (Settings → Modules); dashboard + inventory are core and always on.
- CSV export on all reports; print-friendly sale invoice.
- PWA manifest at `public/manifest.webmanifest`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API (:8787) + Vite dev server (:5173) |
| `npm run build` | Type-check + production build to `dist/` |
| `npm run db:migrate` | Apply pending SQL migrations to Neon |
| `npm run preview` | Serve the production build |

## Deploying to Vercel

1. Import the repo into Vercel.
2. Set `DATABASE_URL` (Neon **pooled** connection string) and `NODE_ENV=production` in project env vars.
3. Framework preset: Vite. The `api/[[...path]].ts` entry serves all `/api/*` routes automatically (`vercel.json` includes the rewrite).
4. Run `npm run db:migrate` once against the production database from your machine.

## Notes

- Sale numbers follow the invoice prefix setting (`INV-00001`); purchases use `INV-P-00001`.
- Returns can be full or per-item partial; returned stock re-enters the ledger (`sale_returned` movements).
- Stock can go negative only when "Allow sales when stock runs out" is enabled in Settings → Inventory.
- No seed/placeholder data ships with the app — the empty states guide first use.
