import { defineConfig, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

type VitestConfig = {
  test?: {
    globals?: boolean
    environment?: string
    setupFiles?: string | string[]
    css?: boolean
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const config: UserConfig & VitestConfig = {
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    css: true,
    deps: {
      optimizer: {
        web: {
          include: ['@tanstack/react-query'],
        },
      },
    },
    alias: {
      '@tanstack/react-query': path.resolve(__dirname, 'src/testUtils/reactQueryMock.tsx'),
    },
  },
}

export default defineConfig(config)
