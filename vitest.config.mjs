import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    clearMocks: true,
    environment: 'node',
    globals: true,
    setupFiles: ['tests/setup.js'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './build',
      reporter: ['html', 'text-summary'],
      include: ['functions/**/*.js'],
      exclude: ['**/node_modules/**'],
    },
  },
})
