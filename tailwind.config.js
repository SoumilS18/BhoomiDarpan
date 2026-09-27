/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        terra: {
          50: '#FDF8F5',
          100: '#F9EBE6',
          200: '#F2D3CA',
          300: '#E4B2A3',
          400: '#D18772',
          500: '#B85D45',
          600: '#9E452F',
          700: '#8B3A2A', // Primary Terracotta
          800: '#732E21',
          900: '#5C2318', // Deep Terracotta
          950: '#3D150D',
        },
        sand: {
          50: '#FAF8F4',
          100: '#F5ECD7', // Sandy Beige
          200: '#EBDCBF',
          300: '#DFC9A1',
          400: '#D1B482',
          500: '#C29F64',
          600: '#A9844B',
          700: '#896739',
          800: '#6E5230',
          900: '#5A432A',
        },
        sienna: {
          50: '#FDEDEB',
          100: '#F9D5D1',
          200: '#F2ADA5',
          300: '#E77C70',
          400: '#D95343',
          500: '#C0392B', // Burnt Sienna
          600: '#A93226',
          700: '#8C291F',
          800: '#70221A',
          900: '#571C16',
        },
        gold: {
          50: '#FDFBF3',
          100: '#FBF5DF',
          200: '#F6E9B9',
          300: '#EDD689',
          400: '#DEC060',
          500: '#C9A84C', // Dusty Gold
          600: '#AF8E39',
          700: '#8C6F2B',
          800: '#6E5624',
          900: '#56431E',
        },
        mocha: {
          50: '#F8F6F5',
          100: '#ECE6E3',
          200: '#D9CCC6',
          300: '#BFADA4',
          400: '#9E887E',
          500: '#7D6A60',
          600: '#65534A',
          700: '#4E3E37',
          800: '#3D2F29',
          900: '#2A1F1B',
        },
        gov: {
          slate: '#2B2320', // Warm mocha-slate charcoal
          navy: {
            DEFAULT: '#8B3A2A', // Terra Warm Earth primary
            mid: '#783123',
            dark: '#5C2318',     // Deep Terracotta sidebar & dark elements
            deeper: '#42170F',
          },
          blue: '#A93226',      // Warm burnt sienna accent
          'blue-soft': '#FBF3E8',// Warm sand light wash
          saffron: '#C9A84C',    // Dusty Gold
          'saffron-light': '#FBF5DF',
          emerald: '#2E7D32',    // Natural earthy forest green
          'emerald-light': '#EBF5EB',
          amber: '#C9A84C',      // Dusty Gold / Earth Amber
          'amber-light': '#FDF8E8',
          red: '#C0392B',        // Burnt Sienna
          'red-light': '#FDEDEB',
          surface: '#FFFDF9',    // Creamy Ivory surface
          canvas: '#FAF5EC',     // Sunbaked sandy beige canvas
          card: '#FFFAF0',       // Warm Ivory card
          border: '#E8DCD0',     // Warm Sand border
          muted: '#7A6B63',      // Warm Earth mocha muted text
          dark: '#2A1F1B',       // Warm deep earth
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'gov': '0 1px 3px 0 rgba(78, 62, 55, 0.06), 0 1px 2px -1px rgba(78, 62, 55, 0.04)',
        'gov-md': '0 4px 6px -1px rgba(78, 62, 55, 0.08), 0 2px 4px -2px rgba(78, 62, 55, 0.05)',
        'gov-lg': '0 10px 15px -3px rgba(78, 62, 55, 0.10), 0 4px 6px -4px rgba(78, 62, 55, 0.05)',
        'gov-header': '0 2px 4px 0 rgba(78, 62, 55, 0.06)',
      },
      borderRadius: {
        card: '0.75rem',
      },
    },
  },
  plugins: [],
}
