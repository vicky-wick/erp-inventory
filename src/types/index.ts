export type AuthUser = { id: string; email: string; name: string; phone?: string | null };
export type WorkspaceSummary = {
  id: string; name: string; logo_url: string | null; currency: string;
  business_type: string; role: "owner" | "admin" | "staff";
};
export type ModuleMap = Record<string, boolean>;
export type WorkspaceSettings = {
  low_stock_threshold: number; auto_sku: boolean; allow_manual_sku: boolean;
  allow_negative_stock: boolean; enable_variants: boolean;
  sku_prefix: string; sku_sequence: number; sale_sequence: number; purchase_sequence: number;
};
export type WorkspaceFull = {
  workspace: {
    id: string; name: string; business_type: string; logo_url: string | null;
    currency: string; phone: string | null; email: string | null; address: string | null;
    gstin: string | null; invoice_prefix: string; invoice_footer: string | null;
    timezone: string; owner_id: string; role?: string;
  };
  modules: { module_key: string; enabled: boolean }[];
  settings: WorkspaceSettings;
  dashboard_preferences: Record<string, boolean> | null;
};

export type Product = {
  id: string; sku: string; name: string; brand: string | null;
  category_id: string | null; category_name?: string | null; supplier_name?: string | null;
  image_url: string | null; selling_price: number; purchase_price: number;
  stock_qty: number; min_stock: number; has_variants: boolean;
  barcode: string | null; description: string | null;
  status: "active" | "archived"; is_low_stock?: boolean;
  created_at: string; updated_at: string;
};
export type Variant = {
  id: string; product_id: string; sku: string; name: string;
  attributes: Record<string, unknown>; barcode: string | null;
  price_override: number | null; stock_qty: number; min_stock: number;
  status: "active" | "archived";
};
export type StockMovement = {
  id: string; movement_type: string; quantity_change: number;
  previous_qty: number; new_qty: number; reference_type: string;
  reference_id: string | null; reason: string | null; note: string | null;
  created_at: string;
};
export type Category = {
  id: string; name: string; description: string | null; product_count: number;
};
export type Supplier = {
  id: string; name: string; phone: string | null; email: string | null;
  address: string | null; notes: string | null; product_count: number; purchase_count: number;
};
export type Sale = {
  id: string; sale_no: string; customer_name: string | null; customer_phone: string | null;
  items_count: number; subtotal: number; discount: number; total: number;
  payment_method: "cash" | "upi" | "card" | "other";
  payment_status: string; status: "completed" | "partially_returned" | "returned" | "cancelled";
  notes: string | null; created_at: string;
};
export type SaleItem = {
  id: string; sale_id: string; product_id: string; variant_id: string | null;
  product_name: string; variant_name: string | null; sku: string;
  quantity: number; returned_qty: number; unit_price: number; line_total: number;
  image_url?: string | null;
};
export type Purchase = {
  id: string; purchase_no: string; supplier_id: string | null; supplier_name?: string | null;
  invoice_no: string | null; purchase_date: string; items_count: number; total: number;
  status: "draft" | "received" | "cancelled"; notes: string | null;
  purchase_date_fmt?: string; received_at: string | null; created_at: string;
};
export type PurchaseItem = {
  id: string; product_id: string; variant_id: string | null; product_name: string;
  sku: string; quantity: number; unit_cost: number; line_total: number;
};
export type AttributeDef = {
  id: string; key: string; name: string;
  field_type: "text" | "number" | "dropdown" | "boolean";
  options: string[]; required: boolean; display_order: number; is_active: boolean;
};
export type DashboardData = {
  stats: {
    total_products: number; low_stock_count: number; inventory_value: number;
    today_sales_total: number; today_sales_count: number;
    period_sales_total: number; period_sales_count: number;
    daily_sales: { day: string; total: number; count: number }[];
    top_products: { product_id: string; name: string; quantity: number; revenue: number }[];
  };
  recent_sales: Pick<Sale, "id" | "sale_no" | "customer_name" | "total" | "payment_method" | "status" | "created_at">[];
  recent_purchases: { id: string; purchase_no: string; total: number; status: string; purchase_date: string }[];
  low_stock: { id: string; name: string; sku: string; image_url: string | null; stock_qty: number; threshold: number }[];
};
export const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard", inventory: "Inventory", sales: "Sales",
  purchases: "Purchases", categories: "Categories", suppliers: "Suppliers",
  reports: "Reports", adjustments: "Stock Adjustments",
};
export const CORE_MODULES = ["dashboard", "inventory"];
export const OPTIONAL_MODULES = ["sales", "purchases", "categories", "suppliers", "reports", "adjustments"];
export const BUSINESS_TYPES = [
  { value: "eyewear", label: "Eyewear" }, { value: "watches", label: "Watches" },
  { value: "bags", label: "Bags" }, { value: "fashion", label: "Fashion" },
  { value: "jewellery", label: "Jewellery" }, { value: "electronics", label: "Electronics" },
  { value: "general", label: "General retail" }, { value: "other", label: "Other" },
];
export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "LKR", "NPR", "BDT"];
export const CATEGORY_SUGGESTIONS: Record<string, string[]> = {
  eyewear: ["Sunglasses", "Frames", "Contact lenses", "Accessories"],
  watches: ["Analog", "Digital", "Smart", "Straps", "Accessories"],
  bags: ["Handbags", "Backpacks", "Wallets", "Luggage"],
  fashion: ["Men", "Women", "Kids", "Footwear", "Accessories"],
  jewellery: ["Rings", "Necklaces", "Earrings", "Bracelets"],
  electronics: ["Phones", "Audio", "Chargers", "Accessories"],
  general: ["General"],
  other: ["General"],
};
