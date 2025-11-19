/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cf: {
          orange: "#F6821F",
          dark: "#1a1a1a",
          charcoal: "#121212",
          graphite: "#1f1f1f",
          steel: "#2b2b2b",
        },
        chat: {
          user: "#1D4ED8",
          ai: "#2f2f2f",
        },
      },
      boxShadow: {
        "panel-glow": "0 10px 40px rgba(246, 130, 31, 0.25)",
      },
      animation: {
        "pulse-slow": "pulse 6s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
}

