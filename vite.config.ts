import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  // The DOM inspector adds `code-path` source-location attributes. `apply: 'serve'`
  // keeps it in the dev server only, so no `vite build` output carries them.
  // The plugin stays in the config list so scripts/release/r06-client-build.mjs,
  // which also builds older pinned commits, keeps finding and removing it.
  plugins: [{ ...inspectAttr(), apply: 'serve' }, react()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
