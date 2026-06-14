import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#5b21b6",
          dark: "#4c1d95",
          light: "#ede9fe",
        },
      },
    },
  },
  plugins: [],
};

export default config;
