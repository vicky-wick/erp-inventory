import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1280px" },
    },
    extend: {
      colors: {
        background: "var(--evolv-bg)",
        "background-2": "var(--evolv-bg-2)",
        surface: "var(--evolv-surface)",
        foreground: "var(--evolv-text)",
        "muted-foreground": "var(--evolv-text-muted)",
        champagne: "var(--evolv-accent)",
        "champagne-light": "var(--evolv-accent-light)",
        line: "var(--evolv-border)",
        success: "var(--evolv-success)",
        warning: "var(--evolv-warning)",
        danger: "var(--evolv-danger)",
        charcoal: "var(--evolv-dark)",
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "ui-serif", "serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xs: "6px",
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "20px",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(38 37 33 / 0.05)",
        sm: "0 1px 3px 0 rgb(38 37 33 / 0.07), 0 1px 2px -1px rgb(38 37 33 / 0.05)",
        md: "0 4px 12px -2px rgb(38 37 33 / 0.08), 0 2px 4px -2px rgb(38 37 33 / 0.04)",
        lg: "0 12px 32px -8px rgb(38 37 33 / 0.12)",
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      spacing: {
        4.5: "1.125rem",
        18: "4.5rem",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 200ms ease-out",
        "slide-up": "slide-up 220ms ease-out",
      },
      transitionTimingFunction: {
        soft: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
