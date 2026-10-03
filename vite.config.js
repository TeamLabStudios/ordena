import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Solo usamos el modelo NSFW "MobileNetV2Mid": quitamos los otros dos del paquete (~35 MB menos)
const dropUnusedNsfwModels = {
  name: 'drop-unused-nsfw-models',
  enforce: 'pre',
  load(id) {
    if (/nsfwjs[\\/]dist[\\/]esm[\\/]model_imports[\\/](inception_v3|mobilenet_v2)\.js$/.test(id)) {
      return 'export var modelJson = () => Promise.reject(new Error("modelo no incluido")); export var weightBundles = [];'
    }
  },
}

export default defineConfig({
  plugins: [dropUnusedNsfwModels, react()],
  base: './',
  build: {
    outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 4000,
    rollupOptions: { input: { main: resolve(__dirname, 'index.html'), worker: resolve(__dirname, 'worker.html') } },
  },
})
