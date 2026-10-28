import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Hub de jogos multi-página: um HTML por jogo + o hub na raiz.
// `base: './'` gera caminhos relativos: o build funciona em qualquer
// subpasta de hospedagem estática (GitHub Pages, Netlify, itch.io etc.).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true },
  build: {
    rollupOptions: {
      input: {
        hub: 'index.html',
        bolinha: 'bolinha/index.html',
        aviao: 'aviao/index.html',
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
