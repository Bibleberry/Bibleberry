import { deepStrictEqual } from 'node:assert/strict'

export const flags = Object.freeze({
  VITE_ENABLE_R06_SHELL: 'true',
  VITE_ENABLE_RELEASE_GATEWAY_SOURCE: 'true',
  VITE_RELEASE_GATEWAY_ORIGIN: '',
  VITE_GATEWAY_ORIGIN: '',
  VITE_ENABLE_DEVELOPER_STUDIO: 'false',
  VITE_ENABLE_CHALLENGE_PILOT: 'false',
  VITE_ENABLE_PARTICIPATION_PILOT: 'false',
  VITE_ENABLE_NATIVE_LIFECYCLE_PROBE: 'false',
})

export const staging = Object.freeze({
  $schema: 'node_modules/wrangler/config-schema.json',
  name: 'bibleberry-staging',
  main: 'src/gateway/worker.ts',
  compatibility_date: '2026-11-01',
  assets: {
    directory: './dist',
    binding: 'ASSETS',
    not_found_handling: 'single-page-application',
    run_worker_first: ['/api/*'],
  },
  vars: {
    SANITY_PROJECT_ID: '80016lrq',
    SANITY_DATASET: 'staging',
    SANITY_API_VERSION: '2026-11-01',
    ALLOWED_ORIGINS: 'https://bibleberry-staging.aw-e44.workers.dev,http://localhost:3000,http://127.0.0.1:3000',
  },
})

export function assertStagingConfig(config) {
  try {
    deepStrictEqual(config, staging)
  } catch {
    // Avoid printing values from unexpected bindings or configuration.
    throw new Error('Staging Wrangler configuration differs from the reviewed profile.')
  }
}

const forbiddenModules = /^(?:studio\/|src\/(?:App\.tsx$|gateway\/|account(?:Auth|Sync|Verification)\/|.*(?:DeveloperStudio|InteractiveChallengeLab|BerryMarkLocalPreview)|cms\/(?:reader\/catalogProvider\.ts$|sanity\/(?:catalog|readPublishedChallenges|developmentFixture)\.ts$)))/i

export function assertReaderModules(modules) {
  if (!modules.includes('src/readerShell/R06ReaderShell.tsx')) {
    throw new Error('R06 shell is missing from the production bundle.')
  }
  if (modules.some(id => forbiddenModules.test(id))) {
    throw new Error('Production bundle contains a disallowed reader module.')
  }
}

const forbiddenClientText = [
  /Developer Studio|Interactive Challenge Lab|code-path=|["']code-path["']/i,
  /\.api\.sanity\.io|\/data\/(?:query|mutate)\/|\/auth\/v1\b|\.supabase\.co\b/i,
  /SANITY_(?:READ|WRITE)_TOKEN|CF_ACCESS_CLIENT_SECRET|CLOUDFLARE_API_TOKEN|SUPABASE_SERVICE_ROLE_KEY/i,
  /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----|eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/,
  /sabbath-development-study|weekly-rhythm-pilot-journal/i,
]

export const readerFilePattern = /^(?:index\.html|favicon\.svg|assets\/[\w.-]+\.(?:js|css|svg|png|webp|woff2?))$/

export function assertReaderFiles(files) {
  for (const [name, bytes] of files) {
    if (!readerFilePattern.test(name)) throw new Error('Unexpected file in reader dist.')
    if (/\.(?:html|js|css|svg)$/.test(name) && forbiddenClientText.some(pattern => pattern.test(bytes.toString('utf8')))) {
      throw new Error('Reader dist contains a disallowed client marker.')
    }
  }
  const html = files.get('index.html')?.toString('utf8')
  const entry = html?.match(/<script type="module"[^>]*src="\.\/(assets\/[\w.-]+\.js)"/)?.[1]
  if (!entry || !files.has(entry) || !files.get('favicon.svg')?.length) {
    throw new Error('Reader dist is missing its HTML, entry script, or favicon.')
  }
  const js = [...files].filter(([name]) => name.endsWith('.js')).map(([, bytes]) => bytes.toString('utf8')).join('\n')
  for (const endpoint of ['/api/challenges', '/api/months/', '/api/library/months', '/api/news']) {
    if (!js.includes(endpoint)) throw new Error('Reader dist lacks an expected release gateway route.')
  }
}
