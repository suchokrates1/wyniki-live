/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./*.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        'tennis-green': {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
      },
      fontFamily: {
        sans: ['Inter var', 'system-ui', '-apple-system', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-slow': 'bounce 2s infinite',
      }
    },
  },
  plugins: [
    require('daisyui'),
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography')
  ],
  daisyui: {
    themes: [
      {
        light: {
          ...require("daisyui/src/theming/themes")["light"],
          primary: "#22c55e",
          secondary: "#1b8941",
          accent: "#0b6d34",
          neutral: "#f9f9f7",
          "base-100": "#ffffff",
          info: "#3b82f6",
          success: "#22c55e",
          warning: "#f59e0b",
          error: "#ef4444"
        },
        dark: {
          ...require("daisyui/src/theming/themes")["dark"],
          primary: "#22c55e",
          secondary: "#1b8941",
          accent: "#0b6d34",
          neutral: "#371541",
          "base-100": "#0f172a",
          info: "#3b82f6",
          success: "#22c55e",
          warning: "#f59e0b",
          error: "#ef4444"
        }
      }
    ],
    darkTheme: "dark",
    base: true,
    styled: true,
    utils: true,
    logs: false
  },
};
