import type { Config } from "tailwindcss";

/**
 * Paleta PROVISÓRIA e neutra. Substituir pelos tokens definitivos da marca.
 * Todas as cores são consumidas via variáveis CSS (src/app/globals.css),
 * então a troca de identidade é feita em um único lugar.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: { DEFAULT: "1.25rem", md: "2rem" }, screens: { "2xl": "1320px" } },
    extend: {
      colors: {
        canvas: "rgb(var(--canvas) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-ink": "rgb(var(--accent-ink) / <alpha-value>)",
        success: "rgb(var(--success) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      borderRadius: { DEFAULT: "6px", lg: "10px" },
      letterSpacing: { label: "0.14em" },
      transitionTimingFunction: { soft: "cubic-bezier(.2,.7,.2,1)" },
    },
  },
  plugins: [],
};
export default config;
