import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: { 
    environment: 'node',
    globals: true,
    setupFiles: ['vitest.setup.ts'],
    // Exclude Edge Functions from testing since they use Deno-specific APIs
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'supabase/functions/**/*.test.ts'
    ]
  }
});
