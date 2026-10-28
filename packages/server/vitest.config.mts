import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false, // os testes dividem um banco
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
