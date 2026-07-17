/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#FF6B35',
          dark: '#E85D04',
          bg: '#FFE8D6',
        },
        bg: '#FFF8F3',
        card: '#FFFFFF',
        text: {
          dark: '#1A1A1A',
          gray: '#8A8A8A',
          lightgray: '#C9BEB6',
        },
        border: '#F0E4DC',
        danger: {
          DEFAULT: '#E63946',
          bg: '#FDE2E2',
        },
        warning: {
          DEFAULT: '#FFAA00',
          bg: '#FFF3D6',
        },
        success: {
          DEFAULT: '#2EBD59',
          bg: '#E3F8EA',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '20px',
        btn: '26px',
        input: '12px',
        chip: '20px',
      },
      boxShadow: {
        card: '0 3px 14px rgba(0,0,0,0.05)',
        btn: '0 4px 12px rgba(255,107,53,0.35)',
      },
      maxWidth: {
        app: '430px',
      },
    },
  },
  plugins: [],
}
