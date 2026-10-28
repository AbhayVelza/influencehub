import { rm } from 'node:fs/promises'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/** public/ is copied as-is; without mocks the MSW worker script has no business in the build. */
function dropMockWorker(useMocks: boolean): Plugin {
  return {
    name: 'drop-mock-worker',
    apply: 'build',
    async writeBundle(options) {
      if (!useMocks && options.dir) await rm(path.join(options.dir, 'mockServiceWorker.js'), { force: true })
    },
  }
}

// Vendor groups keep every production chunk under 500 kB and let lazy screens (charts, kanban) fetch
// their libraries only when opened.
const vendor = (name: string, packages: string[], priority: number) => ({
  name,
  test: new RegExp(`[\\\\/]node_modules[\\\\/](${packages.join('|')})[\\\\/]`),
  priority,
})

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const useMocks = env.VITE_USE_MOCKS === 'true'

  return {
    plugins: [react(), tailwindcss(), dropMockWorker(useMocks)],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    define: {
      // A literal (not a runtime lookup) so `if (!USE_MOCKS)` folds and MSW + fixtures are tree-shaken out.
      'import.meta.env.VITE_USE_MOCKS': JSON.stringify(useMocks ? 'true' : 'false'),
    },
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              vendor('react', ['react', 'react-dom', 'scheduler', 'react-router', 'react-router-dom'], 50),
              vendor('radix', ['radix-ui', '@radix-ui', '@floating-ui', 'cmdk', 'react-remove-scroll.*', 'aria-hidden'], 40),
              vendor('tanstack', ['@tanstack'], 40),
              vendor('forms', ['zod', 'react-hook-form', '@hookform'], 40),
              vendor('dates', ['date-fns', '@date-fns'], 40),
              vendor('charts', ['recharts', 'd3-.*', 'victory-vendor', 'internmap', 'decimal\\.js-light', 'es-toolkit', 'immer', 'redux', '@reduxjs', 'reselect', 'react-redux', 'use-sync-external-store', 'eventemitter3', 'tiny-invariant'], 30),
              vendor('dnd', ['@dnd-kit'], 30),
              vendor('msw', ['msw', '@mswjs', '@open-draft', 'outvariant', 'strict-event-emitter', 'is-node-process', 'headers-polyfill', 'graphql', 'path-to-regexp', 'statuses', 'tough-cookie', 'rettime', 'until-async', 'cookie', 'type-fest'], 30),
            ],
          },
        },
      },
    },
  }
})
