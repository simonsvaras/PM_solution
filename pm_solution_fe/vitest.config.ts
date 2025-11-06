import react from '@vitejs/plugin-react'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // @ts-expect-error - Vitest and Vite ship different plugin typings, but runtime usage is valid.
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    css: true,
    alias: {
      '@tanstack/react-query': resolve(__dirname, 'src/testUtils/reactQueryMock.tsx'),
    },
  },
})
