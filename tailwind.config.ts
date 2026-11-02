import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";

// Theme-aware color: reads an RGB triplet CSS variable (defined in globals.css
// for :root and html.dark) so the whole palette flips in dark mode without
// per-class dark: variants.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: v("brand"),
          dark: v("brand-dark"),
          light: v("brand-light"),
        },
        // Card/panel background: white in light mode, raised dark in dark mode.
        // (bg-white itself is reserved for text-white/borders that must stay white.)
        surface: v("surface"),
        slate: {
          ...colors.slate,
          50: v("slate-50"),
          100: v("slate-100"),
          200: v("slate-200"),
          300: v("slate-300"),
          400: v("slate-400"),
          500: v("slate-500"),
          600: v("slate-600"),
          700: v("slate-700"),
          800: v("slate-800"),
          900: v("slate-900"),
        },
        // Status palettes: only the shades used as light chip backgrounds /
        // dark chip text are variable-backed; solid mid shades stay fixed.
        red: { ...colors.red, 50: v("red-50"), 100: v("red-100"), 200: v("red-200"), 700: v("red-700"), 800: v("red-800") },
        amber: { ...colors.amber, 50: v("amber-50"), 100: v("amber-100"), 200: v("amber-200"), 700: v("amber-700"), 800: v("amber-800") },
        emerald: { ...colors.emerald, 50: v("emerald-50"), 100: v("emerald-100"), 200: v("emerald-200"), 700: v("emerald-700"), 800: v("emerald-800") },
        green: { ...colors.green, 100: v("green-100"), 700: v("green-700") },
        blue: { ...colors.blue, 100: v("blue-100"), 700: v("blue-700") },
      },
    },
  },
  plugins: [],
};

export default config;
