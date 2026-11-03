import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Vendor groups keep every production chunk under 500 kB and let lazy screens (charts, kanban) fetch
// their libraries only when opened.
const vendor = (name: string, packages: string[], priority: number) => ({
  name,
  test: new RegExp(`[\\\\/]node_modules[\\\\/](${packages.join('|')})[\\\\/]`),
  priority,
})

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
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
            // Class-name helpers every component uses. Without their own group they land in the charts chunk, which
            // then loads on every page (sign-in included).
            vendor('ui-utils', ['clsx', 'tailwind-merge', 'class-variance-authority'], 45),
            vendor('charts', ['recharts', 'd3-.*', 'victory-vendor', 'internmap', 'decimal\\.js-light', 'es-toolkit', 'immer', 'redux', '@reduxjs', 'reselect', 'react-redux', 'use-sync-external-store', 'eventemitter3', 'tiny-invariant'], 30),
            vendor('dnd', ['@dnd-kit'], 30),
            // tslib stays out of the Firebase groups: radix and dnd-kit share it.
            // Firestore and Storage load with the data layer; the rest (app, auth) is all the sign-in page needs.
          vendor('firestore', ['@firebase/firestore', '@firebase/webchannel-wrapper', 'firebase/firestore'], 35),
          vendor('firebase-storage', ['@firebase/storage', 'firebase/storage'], 35),
          vendor('firebase', ['firebase', '@firebase', 'idb'], 30),
            // MSW's request routing (no service worker) maps the in-app API calls to src/backend's handlers.
            vendor('msw', ['msw', '@mswjs', '@open-draft', 'outvariant', 'strict-event-emitter', 'is-node-process', 'headers-polyfill', 'graphql', 'path-to-regexp', 'statuses', 'tough-cookie', 'rettime', 'until-async', 'cookie', 'type-fest'], 30),
          ],
        },
      },
    },
  },
})
