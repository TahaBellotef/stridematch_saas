/** 
 * StrideMatch Development Team © 2025 All rights reserved.
 * Author: @macitch (https://www.github.com/macitch)
 * TailwindCSS configuration for StrideMatchLab frontend
 */

const defaultTheme = require("tailwindcss/defaultTheme");

module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],

  darkMode: ["class", '[data-theme="dark"]'], // allows both .dark and [data-theme="dark"]

  theme: {
    extend: {
      fontFamily: {
        sans: ["Manrope", "Inter", ...defaultTheme.fontFamily.sans],
        manrope: ["Manrope", ...defaultTheme.fontFamily.sans],
      },
      colors: {
        sm: {
          primary: {
            500: "#6F41E8",
            600: "#3B1EC5",
          },
          accent: {
            teal: "#11C1C4",
            mint: "#6AFAA5",
          },
          dark: "#211D31",
          light: "#FFFFFF",
          muted: "#B0AFC3",
          text: {
            DEFAULT: "var(--sm-text)",
            muted: "var(--sm-text-muted)",
          },
          surface: {
            DEFAULT: "var(--sm-surface)",
            elevated: "var(--sm-surface-elevated)",
          },
          border: "var(--sm-border)",
        },
      },
      backgroundImage: {
        "gradient-lab":
          "linear-gradient(135deg, #4f21ff 0%, #3a1edc 60%, #2e16be 100%)",
        "gradient-green":
          "linear-gradient(90deg, #6ff5b2 0%, #54eda3 100%)",
        "gradient-accent":
          "linear-gradient(135deg, #11C1C4 0%, #6AFAA5 100%)",
      },
      boxShadow: {
        lab: "0 50px 120px rgba(8, 14, 46, 0.4)",
        glow: "0 20px 45px rgba(255, 255, 255, 0.35)",
      },
      borderRadius: {
        lab: "clamp(2rem, 5vw, 3.5rem)",
      },
      maxWidth: {
        lab: "1100px",
      },
      keyframes: {
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        spinHero: {
          to: { transform: "rotate(360deg)" },
        },
      },
      animation: {
        fadeInUp: "fadeInUp 0.6s ease forwards",
        spinHero: "spinHero 0.8s linear infinite",
      },
    },
  },

  plugins: [
    require("@tailwindcss/forms"),
    require("@tailwindcss/typography"),
  ],
};
