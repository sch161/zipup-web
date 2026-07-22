/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#F0660D',
          dark: '#9B3B11',
          bg: '#FDE3D3',
        },
        bg: '#FFF5F4',
        card: '#FFFFFF',
        text: {
          dark: '#1A1A1A',
          gray: '#454545',
          lightgray: '#9E9E9E',
        },
        border: {
          DEFAULT: '#E0926B',
          input: '#9E9E9E',
        },
        danger: {
          DEFAULT: '#FF4646',
          bg: '#FFDBDB',
        },
        warning: {
          DEFAULT: '#FF893D',
          bg: '#FFE7D3',
        },
        success: {
          DEFAULT: '#006F34',
          bg: '#CFFFC9',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '30px',
        btn: '9999px',
        input: '10px',
        chip: '20px',
      },
      boxShadow: {
        card: '0 2px 10px rgba(155,59,17,0.08)',
        btn: '0 4px 14px rgba(240,102,13,0.3)',
      },
      maxWidth: {
        app: '430px',
      },
    },
  },
  plugins: [],
}
