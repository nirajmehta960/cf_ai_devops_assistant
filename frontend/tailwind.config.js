/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f5f7ff",
          100: "#e1e7ff",
          200: "#c1c9ff",
          300: "#9ea6ff",
          400: "#7e83ff",
          500: "#5b60ff",
          600: "#3b3dde",
          700: "#2a2cab",
          800: "#1b1d73",
          900: "#0d0f40",
        },
        slate: {
          950: "#05060a",
        },
      },
      boxShadow: {
        "glow-sm": "0 10px 40px rgba(91, 96, 255, 0.3)",
      },
      animation: {
        "pulse-slow": "pulse 6s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
}

