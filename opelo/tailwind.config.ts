import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        lime: {
          50:  "#f7ffe0",
          100: "#ecfccb",
          200: "#d9f99d",
          300: "#bef264",
          400: "#a3e635",
          500: "#84cc16",
          600: "#65a30d",
          700: "#4d7c0f",
          800: "#3f6212",
          900: "#365314",
        },
        stone: {
          50:  "#fafaf9",
          100: "#f5f5f4",
          200: "#e7e5e4",
          300: "#d6d3d1",
          400: "#a8a29e",
          500: "#78716c",
          600: "#57534e",
          700: "#44403c",
          800: "#292524",
          900: "#1c1917",
          950: "#0c0a09",
        },
        // ink is semantically inverted for light theme:
        // low numbers = dark text, high numbers = light backgrounds
        ink: {
          "50":  "#0c0a09",
          "100": "#1c1917",
          "200": "#292524",
          "300": "#44403c",
          "400": "#57534e",
          "500": "#78716c",
          "600": "#a8a29e",
          "700": "#d6d3d1",
          "800": "#e7e5e4",
          "900": "#f5f5f4",
          "950": "#fafaf9",
        },
        accent: {
          DEFAULT: "#84cc16",
          soft:    "#a3e635",
          glow:    "#d9f99d",
        },
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans:  ["var(--font-sans)", "system-ui", "sans-serif"],
        mono:  ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
        soft: "0 4px 24px rgba(0,0,0,0.06)",
        glow: "0 0 0 1px rgba(132,204,22,0.25), 0 4px 20px rgba(132,204,22,0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
