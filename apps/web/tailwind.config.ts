import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../packages/shared/src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        canvas: "rgb(var(--canvas) / <alpha-value>)",
        "canvas-strong": "rgb(var(--canvas-strong) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-muted": "rgb(var(--surface-muted) / <alpha-value>)",
        "surface-contrast": "rgb(var(--surface-contrast) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        soft: "rgb(var(--soft) / <alpha-value>)",
        faint: "rgb(var(--faint) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        "line-strong": "rgb(var(--line-strong) / <alpha-value>)",
        research: "rgb(var(--research) / <alpha-value>)",
        bo: "rgb(var(--bo) / <alpha-value>)",
        xai: "rgb(var(--xai) / <alpha-value>)",
        success: "rgb(var(--success) / <alpha-value>)"
      },
      boxShadow: {
        card: "0 18px 46px -28px rgba(82, 61, 29, 0.22)",
        float: "0 32px 90px -42px rgba(61, 50, 37, 0.28)",
        inset: "inset 0 1px 0 rgba(255, 255, 255, 0.5)"
      },
      borderRadius: {
        panel: "2rem",
        card: "1.5rem"
      }
    }
  },
  plugins: []
};

export default config;
