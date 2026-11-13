import path from 'node:path'
import { defineConfig } from 'vite'

// Builds the API server (server/main.ts → dist-server/main.js). It shares src/backend, src/lib and src/types with
// the app, so it goes through Vite for the `@/` alias and `import.meta.env`; npm packages stay external.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    ssr: 'server/main.ts',
    outDir: 'dist-server',
    target: 'node22',
    emptyOutDir: true,
    copyPublicDir: false,
  },
})
