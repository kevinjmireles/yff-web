import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { 
    environment: 'node',
    globals: true,
    // Exclude Edge Functions from testing since they use Deno-specific APIs
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'supabase/functions/**/*.test.ts'
    ]
  }
});
