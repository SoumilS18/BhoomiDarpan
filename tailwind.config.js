/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gov: {
          slate: '#0f172a',
          navy: {
            DEFAULT: '#1e3a8a',
            mid: '#1e40af',
            dark: '#172554',
            deeper: '#101c3f',
          },
          blue: '#2563eb',
          'blue-soft': '#eff6ff',
          saffron: '#d97706',
          'saffron-light': '#fef3c7',
          emerald: '#059669',
          'emerald-light': '#d1fae5',
          amber: '#d97706',
          'amber-light': '#fef3c7',
          red: '#dc2626',
          'red-light': '#fee2e2',
          surface: '#ffffff',
          canvas: '#f4f6fa',
          card: '#ffffff',
          border: '#e2e8f0',
          muted: '#64748b',
          dark: '#020617',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'gov': '0 1px 2px 0 rgba(15, 23, 42, 0.05)',
        'gov-md': '0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -2px rgba(15, 23, 42, 0.05)',
        'gov-lg': '0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.04)',
        'gov-header': '0 1px 3px 0 rgba(15, 23, 42, 0.06)',
      },
      borderRadius: {
        card: '0.75rem',
      },
    },
  },
  plugins: [],
}
