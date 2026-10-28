import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// `base: './'` gera caminhos relativos: o build funciona em qualquer
// subpasta de hospedagem estática (GitHub Pages, Netlify, itch.io etc.).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
