import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { mroBffPlugin } from './server/mroBffPlugin.ts'

export default defineConfig({
  plugins: [react(), tailwindcss(), mroBffPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4174,
    strictPort: true,
    allowedHosts: ['.run.app', 'localhost', '127.0.0.1'],
  },
})
