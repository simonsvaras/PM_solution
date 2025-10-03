import { defineConfig, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'

type VitestConfig = {
  test?: {
    globals?: boolean
    environment?: string
    setupFiles?: string | string[]
    css?: boolean
  }
}

const config: UserConfig & VitestConfig = {
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    css: true,
  },
}

export default defineConfig(config)
