import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { post } from "@/lib/api";
import { useSession } from "@/providers/session";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field, FieldError } from "@/components/ui/input";
import { cn } from "@/components/ui/button";
import { BUSINESS_TYPES, CURRENCIES, OPTIONAL_MODULES, MODULE_LABELS, type WorkspaceFull } from "@/types";

const STEPS = ["Welcome", "Business name", "Type", "Currency", "Modules", "Done"];

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState("general");
  const [currency, setCurrency] = useState("INR");
  const [phone, setPhone] = useState("");
  const [modules, setModules] = useState<Record<string, boolean>>({
    sales: true, purchases: false, categories: true, suppliers: false, reports: false, adjustments: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { refreshWorkspace, refreshMe, setActiveId } = useSession();
  const navigate = useNavigate();

  async function finish() {
    setError(null);
    if (!name.trim()) {
      setStep(1);
      setError("Your business name is required");
      return;
    }
    setLoading(true);
    try {
      const enabled = Object.entries(modules).filter(([, v]) => v).map(([k]) => k);
      const data = await post<{ workspace: { id: string } }>("/workspaces", {
        name, business_type: businessType, currency, phone, modules: enabled,
      });
      localStorage.setItem("evolv.workspace", data.workspace.id);
      setActiveId(data.workspace.id);
      await Promise.all([refreshMe(), refreshWorkspace()]);
      navigate("/app/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create your workspace");
    } finally {
      setLoading(false);
    }
  }

  const canNext = step !== 1 || name.trim().length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="mx-auto w-full max-w-md flex-1 px-4 py-6 pt-safe">
        {/* progress */}
        <div className="mb-8 flex gap-1.5">
          {STEPS.map((_, i) => (
            <div key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i <= step ? "bg-accent" : "bg-background-2")} />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.18 }}
          >
            {step === 0 && (
              <div className="pt-10 text-center">
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-charcoal shadow-md">
                  <span className="font-display text-3xl font-bold text-champagne-light">E</span>
                </div>
                <h1 className="font-display text-2xl font-bold">Welcome to EVOLV</h1>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
                  One simple place for your products, stock, sales and purchases. Let's set up your business — it takes under a minute.
                </p>
              </div>
            )}

            {step === 1 && (
              <div>
                <h1 className="font-display text-xl font-bold">What's your business called?</h1>
                <p className="mb-5 mt-1 text-sm text-muted-foreground">This is how your workspace will appear inside the app.</p>
                <Field label="Business name">
                  <Input
                    autoFocus value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Raman Club, Urban Bags" maxLength={80}
                  />
                </Field>
              </div>
            )}

            {step === 2 && (
              <div>
                <h1 className="font-display text-xl font-bold">What do you sell?</h1>
                <p className="mb-5 mt-1 text-sm text-muted-foreground">This helps us suggest categories. You can change it later.</p>
                <div className="grid grid-cols-2 gap-2">
                  {BUSINESS_TYPES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setBusinessType(t.value)}
                      className={cn(
                        "rounded-md border p-3.5 text-left text-sm font-medium transition-colors",
                        businessType === t.value
                          ? "border-accent bg-champagne-light/40 text-foreground"
                          : "border-line bg-surface text-muted-foreground hover:bg-background-2"
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="mt-5">
                  <Field label="Phone" optional>
                    <Input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Store phone" />
                  </Field>
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <h1 className="font-display text-xl font-bold">Choose your currency</h1>
                <p className="mb-5 mt-1 text-sm text-muted-foreground">Used for all prices in your workspace.</p>
                <div className="grid grid-cols-4 gap-2">
                  {CURRENCIES.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCurrency(c)}
                      className={cn(
                        "rounded-md border py-3 text-sm font-semibold transition-colors",
                        currency === c ? "border-accent bg-champagne-light/40" : "border-line bg-surface hover:bg-background-2"
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 4 && (
              <div>
                <h1 className="font-display text-xl font-bold">Choose your modules</h1>
                <p className="mb-1 mt-1 text-sm text-muted-foreground">
                  Only turn on what you need. Dashboard and Inventory are always on. You can change this anytime in Settings.
                </p>
                <div className="mt-4 space-y-2">
                  {OPTIONAL_MODULES.map((m) => (
                    <label
                      key={m}
                      className="flex cursor-pointer items-center justify-between rounded-md border border-line bg-surface p-3.5"
                    >
                      <span className="text-sm font-medium">{MODULE_LABELS[m]}</span>
                      <input
                        type="checkbox"
                        checked={modules[m]}
                        onChange={(e) => setModules((prev) => ({ ...prev, [m]: e.target.checked }))}
                        className="h-5 w-5 accent-[#a37e35]"
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <FieldError message={error} />
      </div>

      <div className="sticky bottom-0 border-t border-line bg-surface px-4 py-3 pb-safe">
        <div className="mx-auto flex max-w-md gap-3">
          {step > 0 && (
            <Button variant="secondary" onClick={() => setStep((s) => s - 1)} className="flex-1" size="lg">
              Back
            </Button>
          )}
          {step < 4 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext} className="flex-[2]" size="lg">
              {step === 0 ? "Get started" : "Continue"}
            </Button>
          ) : (
            <Button onClick={finish} loading={loading} className="flex-[2]" size="lg">
              Open my dashboard
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
