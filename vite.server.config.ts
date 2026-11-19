import path from 'node:path'
import { defineConfig } from 'vite'

// Builds the API server (server/main.ts → dist-server/main.js) and the migration (server/migrate.ts →
// dist-server/migrate.js). They share src/backend, src/lib and src/types with the app, so they go through Vite for
// the `@/` alias and `import.meta.env`; npm packages stay external.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    ssr: true,
    rollupOptions: {
      input: { main: 'server/main.ts', migrate: 'server/migrate.ts' },
    },
    outDir: 'dist-server',
    target: 'node22',
    emptyOutDir: true,
    copyPublicDir: false,
  },
})
