import type { Config } from "tailwindcss";

// One light theme for the whole app: graphite neutrals, ink for primary actions,
// lime for highlights. The default blue/indigo/purple scales are remapped so the
// existing utility classes pick up the theme without per-component rewrites.
const neutral = {
  50: "#f6f7f4", 100: "#eef0eb", 200: "#e1e4de", 300: "#cdd2c9", 400: "#9aa0a6",
  500: "#747a83", 600: "#5d636c", 700: "#3d4249", 800: "#24282e", 900: "#0e1013", 950: "#07080a",
};
const ink = {
  50: "#f5f9e8", 100: "#ebf5cf", 200: "#d9eca3", 300: "#c3e26c", 400: "#a6cf32",
  500: "#3a3f46", 600: "#16191d", 700: "#0e1013", 800: "#050607", 900: "#000000", 950: "#000000",
};

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        gray: neutral, slate: neutral, zinc: neutral,
        blue: ink, indigo: ink, purple: ink, violet: ink, sky: ink,
        lime: { DEFAULT: "#b6ea3c", ink: "#3f5f06" },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: { lg: "6px", xl: "8px", "2xl": "10px" },
      boxShadow: {
        sm: "0 1px 0 rgb(14 16 19 / 0.04)",
        DEFAULT: "0 1px 2px rgb(14 16 19 / 0.06)",
        md: "0 4px 12px -6px rgb(14 16 19 / 0.12)",
        lg: "0 12px 32px -16px rgb(14 16 19 / 0.22)",
        xl: "0 20px 48px -20px rgb(14 16 19 / 0.28)",
        "2xl": "0 28px 64px -24px rgb(14 16 19 / 0.32)",
      },
    },
  },
  plugins: [],
};

export default config;
