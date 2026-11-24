/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#15243a",
        muted: "#778397",
        line: "#e7ebf0",
        canvas: "#f6f7f9",
        brand: "#4358d6",
        mint: "#d8f4e8",
      },
      boxShadow: {
        card: "0 1px 2px rgba(18, 35, 57, .04), 0 8px 24px rgba(18, 35, 57, .035)",
      },
    },
  },
  plugins: [],
};
