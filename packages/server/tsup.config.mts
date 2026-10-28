import { defineConfig } from 'tsup';

// CommonJS: é assim que a Vercel carrega a função compilada (mesma lição do AquaOps).
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
});
