import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['public/js/**/*.js'],
      exclude: ['public/js/app.js'] // Entry point, tested via E2E
    }
  }
});
