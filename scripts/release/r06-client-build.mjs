import { copyFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { build, loadConfigFromFile } from 'vite'
import { assertReaderModules } from './r06-staging-profile.mjs'

const root = process.cwd()
const disabledModules = new Map([
  ['src/App.tsx', 'export default function DisabledLegacyReader() { throw new Error("R06 is required for this build.") }'],
  ['src/cms/reader/catalogProvider.ts', `export const defaultPublishedCatalogProvider = {
    async loadCatalog() { return { status: 'requestError', message: 'Only the release gateway is available.' } }
  }`],
])
const replaced = new Set()

const boundary = {
  name: 'r06-staging-reader-boundary',
  enforce: 'pre',
  resolveId(source, importer) {
    if (!importer || !source.startsWith('.')) return
    const file = relative(root, resolve(dirname(importer), source))
    if (disabledModules.has(file)) {
      replaced.add(file)
      return '\0r06-disabled:' + file
    }
  },
  load(id) {
    if (id.startsWith('\0r06-disabled:')) return disabledModules.get(id.slice('\0r06-disabled:'.length))
  },
  generateBundle(_options, bundle) {
    if (replaced.size !== disabledModules.size) throw new Error('Review the R06 build boundaries after the source change.')
    const modules = Object.values(bundle).flatMap(item => item.type === 'chunk'
      ? Object.entries(item.modules).filter(([, info]) => info.renderedLength > 0).map(([id]) => relative(root, id))
      : [])
    assertReaderModules(modules)
  },
}

const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' })
const plugins = loaded?.config.plugins?.flat(Infinity)
if (!plugins?.some(plugin => plugin.name === 'vite-plugin-inspect-dom-simple')) {
  throw new Error('Review the application Vite configuration before building R06.')
}

await build({
  ...loaded.config,
  base: '/',
  configFile: false,
  mode: 'production',
  envFile: false,
  publicDir: false,
  plugins: [boundary, ...plugins.filter(plugin => plugin.name !== 'vite-plugin-inspect-dom-simple')],
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
})
await copyFile('public/favicon.svg', 'dist/favicon.svg')
// Approved static-asset security headers (#369); r06-staging-profile.mjs pins their exact rules.
await copyFile('public/_headers', 'dist/_headers')
