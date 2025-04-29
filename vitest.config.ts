import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        globals: true, // Enable global test functions (e.g., describe, it, expect)
        environment: 'node', // Use Node.js environment; switch to 'jsdom' for browser testing
        coverage: {
            provider: 'v8', // Change to 'v8' if you switch to @vitest/coverage-v8
            reporter: ['text', 'html'], // Output coverage as text and HTML reports
        },
    },
})
