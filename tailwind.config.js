// Tailwind is used only by the Accounting area (src/erp). Every utility is scoped under
// #erp-root and the global reset is off, so the public website's CSS is untouched.
// Colours are the website's own palette (src/styles.css) in place of the ERP's blue.
export default {
  content: ['./src/erp/**/*.{js,jsx}'],
  important: '#erp-root',
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#8A6634', // --gold-ink: primary buttons, active nav, links
          dark: '#6E5129', // hover / pressed
          gold: '#B98E57', // --gold: accents, focus rings, charts
          soft: '#F8F3EA', // row hover, subtle fills
          tint: '#EFE4D2', // selected rows, badges
        },
        ink: '#1C1C1A', // --ink: headings and body text
        olive: '#2E2F28', // --olive: dark panels and modal headers
        paper: '#F5F4F1', // admin page background
        line: '#E4E3DF', // --line: borders
        muted: '#66655F', // --muted: secondary text
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        display: ['"Bebas Neue"', 'Oswald', 'Impact', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(28, 28, 26, 0.04), 0 1px 3px rgba(28, 28, 26, 0.06)',
      },
    },
  },
  plugins: [],
};
