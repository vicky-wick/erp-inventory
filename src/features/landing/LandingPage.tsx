import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Package, ReceiptText, ScrollText, Check } from "lucide-react";

const EASE = [0.22, 0.61, 0.36, 1] as const;

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: EASE, delay },
});

const FEATURES = [
  {
    icon: <ScrollText size={20} />,
    title: "A ledger for every unit",
    body: "Every sale, return, damage and purchase is written to an immutable stock history. Know exactly what happened, and when.",
  },
  {
    icon: <ReceiptText size={20} />,
    title: "Sales in seconds",
    body: "Ring up a sale in three taps. Discounts, payment modes and receipts — without spreadsheets or second-guessing.",
  },
  {
    icon: <Package size={20} />,
    title: "Stock that thinks ahead",
    body: "Low-stock alerts, purchase receiving and one-tap adjustments keep the shelf count honest, always.",
  },
];

const POINTS = ["No credit card", "Set up in under a minute", "Your data, row-level secured"];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background-2">
      {/* Top bar */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-charcoal shadow-md">
            <span className="font-display text-lg font-semibold text-gold">E</span>
          </div>
          <span className="font-display text-lg font-semibold tracking-[0.18em] text-charcoal">EVOLV</span>
        </div>
        <Link
          to="/login"
          className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent"
        >
          Sign in
        </Link>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-5 sm:px-8">
        <motion.div
          {...fade(0)}
          className="relative overflow-hidden rounded-2xl bg-charcoal px-6 py-14 text-center sm:px-12 sm:py-20"
        >
          {/* gold aura */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full opacity-30 blur-3xl"
            style={{ background: "radial-gradient(circle, #d8b565 0%, transparent 70%)" }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{ background: "linear-gradient(90deg, transparent, #d8b565aa 30%, #d8b565aa 70%, transparent)" }}
          />

          <p className="eyebrow text-gold">Retail, elevated</p>
          <h1 className="mx-auto mt-4 max-w-xl font-display text-4xl font-semibold leading-[1.08] text-white sm:text-6xl">
            The quiet craft of <em className="text-gold not-italic">commerce.</em>
          </h1>
          <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-white/60 sm:text-base">
            EVOLV is the calm, precise home for your shop — inventory, sales, purchases and stock
            truth in one beautifully simple place.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/register"
              className="gold-surface inline-flex h-12 w-full items-center justify-center gap-2 rounded-md px-6 text-sm font-semibold shadow-lg transition-transform hover:scale-[1.015] sm:w-auto"
            >
              Start free <ArrowRight size={16} />
            </Link>
            <Link
              to="/login"
              className="inline-flex h-12 w-full items-center justify-center rounded-md border border-white/15 px-6 text-sm font-medium text-white/85 transition-colors hover:bg-white/5 sm:w-auto"
            >
              I have an account
            </Link>
          </div>
          <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {POINTS.map((p) => (
              <li key={p} className="flex items-center gap-1.5 text-2xs text-white/45">
                <Check size={12} className="text-gold" /> {p}
              </li>
            ))}
          </ul>
        </motion.div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-5 py-14 sm:px-8 sm:py-20">
        <motion.p {...fade(0.05)} className="eyebrow text-center text-foreground/40">
          Everything essential, nothing extra
        </motion.p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE, delay: 0.1 + i * 0.08 }}
              className="rounded-xl border border-line bg-surface p-6 shadow-xs"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
                {f.icon}
              </div>
              <h3 className="font-display text-lg font-semibold text-foreground">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Pull quote */}
      <section className="mx-auto max-w-3xl px-5 pb-14 text-center sm:px-8">
        <motion.blockquote
          {...fade(0.1)}
          className="font-display text-2xl font-medium leading-snug text-foreground/85 sm:text-3xl"
        >
          “Luxury is not more features. It is <span className="text-gold">fewer, truer ones</span> —
          done beautifully.”
        </motion.blockquote>
      </section>

      {/* Closing CTA */}
      <section className="mx-auto max-w-5xl px-5 pb-16 sm:px-8">
        <motion.div
          {...fade(0.1)}
          className="flex flex-col items-center justify-between gap-5 rounded-2xl bg-charcoal px-8 py-10 text-center sm:flex-row sm:text-left"
        >
          <div>
            <h2 className="font-display text-2xl font-semibold text-white">Open your shop tonight.</h2>
            <p className="mt-1.5 text-sm text-white/55">
              Create a workspace, add your first product, take a sale — before your tea cools.
            </p>
          </div>
          <Link
            to="/register"
            className="gold-surface inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-md px-7 text-sm font-semibold shadow-lg transition-transform hover:scale-[1.015]"
          >
            Start free <ArrowRight size={16} />
          </Link>
        </motion.div>

        <footer className="mt-10 flex flex-col items-center gap-2 pb-4 text-center">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-charcoal">
              <span className="font-display text-xs font-semibold text-gold">E</span>
            </div>
            <span className="font-display text-sm tracking-[0.2em] text-foreground/70">EVOLV</span>
          </div>
          <p className="text-2xs text-muted-foreground">One platform. Your business.</p>
        </footer>
      </section>
    </div>
  );
}
