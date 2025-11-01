/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{ts,tsx,js,jsx,html}'
  ],
  theme: {
    extend: {},
  },
  // Evita que Tailwind modifique estilos base (reset) hasta que migremos la UI
  corePlugins: {
    preflight: false,
  },
  plugins: [],
}
