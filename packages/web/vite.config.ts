import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Só no desenvolvimento: repassa /api para o processo da API (npm run dev na raiz).
// Na Vercel, os rewrites do vercel.json mandam /api/* para o serviço "server".
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:4000';

// Hub de jogos multi-página: um HTML por jogo + o hub na raiz.
// `base: './'` gera caminhos relativos: o build funciona em qualquer
// subpasta de hospedagem estática (GitHub Pages, Netlify, itch.io etc.).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true, proxy: { '/api': apiTarget } },
  // preview sem API_PROXY_TARGET = como uma hospedagem estática (sem servidor → ranking local)
  preview: { proxy: process.env.API_PROXY_TARGET ? { '/api': apiTarget } : {} },
  build: {
    rollupOptions: {
      input: {
        hub: 'index.html',
        bolinha: 'bolinha/index.html',
        aviao: 'aviao/index.html',
        corrida: 'corrida/index.html',
        cobrinha: 'cobrinha/index.html',
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
