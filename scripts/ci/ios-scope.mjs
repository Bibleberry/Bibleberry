import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const sha = /^[0-9a-f]{40}$/
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

const nativeSource = /^src\/(?:(?:App|main)\.tsx$|(?:native|deepLinkIngress|participation|shelfPersistence|readerProfile|readerShell\/navigation|appIntegration)\/)/
const nativeStorage = new Set([
  'src/components/announcements/announcementPreferencesStorage.ts',
  'src/components/month/monthIntroStorage.ts',
])
const nativeReference = /@capacitor\b|\bCapacitor\b|\bcordova\b|\bWKWebView\b|webkit\s*\.\s*messageHandlers|CapacitorPreferences|(?:^|[/'"])\b(?:native|deepLinkIngress|participation|shelfPersistence|readerProfile)\//im
const staticAsset = /\.(?:avif|gif|ico|jpe?g|png|svg|webp|woff2?|ttf|otf|pdf|mp3|mp4|webm|vtt)$/i
const unrelatedFolder = /^(?:android|docs|studio|supabase)\//
const runtimeTest = /^tests\/(?:ci\/|[^/]*(?:ios|native|simulator|deepLinkIngress|participation|shelfPersistence|readerProfile))/i
const unrelatedFiles = new Set([
  '.github/workflows/native-android.yml',
  'README.md',
  'info.md',
  'INTERACTIVE_CHALLENGE_LAB_HANDOFF.md',
  'eslint.config.js',
  'playwright.config.ts',
  'wrangler.jsonc',
  'wrangler.staging.jsonc',
  'components.json',
])

function git(cwd, ...args) {
  return utf8.decode(execFileSync('git', args, {
    cwd,
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }))
}

function changedPaths(cwd, before, after) {
  // Treat a rename as a deletion and addition so both names are classified.
  const fields = git(cwd, 'diff', '--no-ext-diff', '--no-renames', '--ignore-submodules=none', '--raw', '-z', before, after, '--').split('\0')
  if (fields.pop() !== '' || fields.length % 2 !== 0) throw new Error('Malformed Git diff')

  const changes = []
  for (let i = 0; i < fields.length; i += 2) {
    const [header, path] = [fields[i], fields[i + 1]]
    // Non-regular files (including symlinks) may change what a build input resolves to.
    const change = /^:(?:000000|100644|100755) (?:000000|100644|100755) [0-9a-f]+ [0-9a-f]+ ([ADM])$/.exec(header)
    if (!change || /[\x00-\x1f\x7f]/.test(path)
        || path.split('/').some(part => part === '' || part === '.' || part === '..')) {
      throw new Error('Unrecognized changed path or status')
    }
    changes.push({ status: change[1], path, before, after })
  }
  return changes
}

export function detectIosScope({ event, base, head, build, cwd }) {
  if (event !== 'pull_request') return { scope: 'runtime', reason: 'Full acceptance for non-PR events' }

  try {
    if (![base, head, build].every(value => typeof value === 'string' && sha.test(value))
        || git(cwd, 'rev-parse', '--is-shallow-repository').trim() !== 'false'
        || git(cwd, 'rev-parse', 'HEAD').trim() !== build
        || git(cwd, 'show', '-s', '--format=%P', build).trim() !== `${base} ${head}`) {
      throw new Error('Cannot verify the PR merge commit against the event')
    }
    const mergeBase = git(cwd, 'merge-base', '--all', base, head).trim()
    if (!sha.test(mergeBase)) throw new Error('Expected one comparison merge base')

    const changes = [
      ...changedPaths(cwd, mergeBase, head),
      ...changedPaths(cwd, base, build),
    ]
    if (!changes.length) throw new Error('PR diff is empty')

    let scope = 'none'
    for (const { status, path, before, after } of changes) {
      if (unrelatedFolder.test(path) || unrelatedFiles.has(path)
          || (path.startsWith('tests/') && !runtimeTest.test(path))) continue
      if (nativeSource.test(path) || nativeStorage.has(path)) {
        return { scope: 'runtime', reason: 'Native integration source changed' }
      }

      if (/^src\/.*\.(?:[cm]?[jt]sx?|css|json|html)$/.test(path)) {
        // Inspect both versions to catch a new native bridge and the removal of an existing one.
        if ((status !== 'A' && nativeReference.test(git(cwd, 'cat-file', 'blob', `${before}:${path}`)))
          || (status !== 'D' && nativeReference.test(git(cwd, 'cat-file', 'blob', `${after}:${path}`)))) {
          return { scope: 'runtime', reason: 'Changed web source references native integration' }
        }
      } else if (!/^(?:src|public)\//.test(path) || !staticAsset.test(path)) {
        // Native projects, CI, packaging inputs and unfamiliar paths all require runtime.
        return { scope: 'runtime', reason: 'Native, packaging, CI, or unclassified input changed' }
      }
      scope = 'build'
    }
    return { scope, reason: scope === 'build' ? 'Web bundle inputs changed' : 'Only unrelated paths changed' }
  } catch {
    return { scope: 'runtime', reason: 'PR comparison could not be established' }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { scope, reason } = detectIosScope({
    event: process.env.GITHUB_EVENT_NAME,
    base: process.env.PR_BASE_SHA,
    head: process.env.PR_HEAD_SHA,
    build: process.env.GITHUB_SHA,
  })
  console.log(`iOS scope: ${scope} (${reason})`)
  appendFileSync(process.env.GITHUB_OUTPUT, `scope=${scope}\nreason=${reason}\n`)
}
