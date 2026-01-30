import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@asc/domain': resolve(__dirname, '../../packages/domain/src'),
    },
  },
});
