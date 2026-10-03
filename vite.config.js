import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 4000,
    rollupOptions: { input: { main: resolve(__dirname, 'index.html'), worker: resolve(__dirname, 'worker.html') } },
  },
})
