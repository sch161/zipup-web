/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      screens: {
        lg: '900px',
      },
      colors: {
        primary: {
          DEFAULT: '#FF5A1F',
          dark: '#D8480F',
          bg: '#FFF3EC',
        },
        bg: '#FFFFFF',
        card: '#FFFFFF',
        subtle: '#F7F6F3',
        text: {
          dark: '#17171A',
          gray: '#5F5E59',
          lightgray: '#8A897F',
        },
        border: {
          DEFAULT: '#ECEBE7',
          input: '#E4E2DD',
        },
        danger: {
          DEFAULT: '#E5484D',
          bg: '#FDF2F0',
        },
        warning: {
          DEFAULT: '#E8912A',
          bg: '#FDF6EA',
        },
        success: {
          DEFAULT: '#12A150',
          bg: '#EAF8EF',
        },
      },
      fontFamily: {
        sans: ['Pretendard', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '20px',
        btn: '13px',
        input: '12px',
        chip: '999px',
      },
      boxShadow: {
        card: '0 2px 4px rgba(23,23,26,0.04), 0 20px 40px rgba(23,23,26,0.06)',
        btn: '0 8px 20px rgba(255,90,31,0.28)',
      },
      maxWidth: {
        app: '430px',
      },
    },
  },
  plugins: [],
}
