import { deepEqual, rejects, throws } from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { describeFiles, sha256, verifyArtifact } from '../../scripts/release/r06-preflight.mjs'
import {
  assertReaderFiles, assertReaderModules, assertStagingConfig, flags, parseStaticHeaders, staging, staticHeaders,
} from '../../scripts/release/r06-staging-profile.mjs'
import { isAccessChallenge } from '../../scripts/release/r06-verify-staging.mjs'

const commit = 'a'.repeat(40)
const entry = 'assets/entry.js'
const reader = new Map([
  ['index.html', Buffer.from('<script type="module" src="/assets/entry.js"></script>')],
  ['favicon.svg', Buffer.from('<svg/>')],
  [entry, Buffer.from('/api/challenges /api/months/ /api/library/months /api/news')],
  ['_headers', await readFile(new URL('../../public/_headers', import.meta.url))],
])

test('reader dist must carry exactly the approved static headers (#369)', () => {
  assertReaderFiles(reader)
  const without = new Map(reader)
  without.delete('_headers')
  throws(() => assertReaderFiles(without), /approved static headers file/)
  const approved = reader.get('_headers').toString('utf8')
  const variants = [
    approved.replace("frame-ancestors 'none'", "frame-ancestors 'none'; script-src *"),
    approved.replace('  X-Frame-Options: DENY\n', ''),
    approved + '  Strict-Transport-Security: max-age=31536000\n',
    approved + '/api/*\n  X-Frame-Options: DENY\n',
    approved + '  x-frame-options: SAMEORIGIN\n',
    approved + '/*\n  X-Robots-Tag: noindex\n',
    'not a headers file',
  ]
  for (const text of variants) {
    throws(() => assertReaderFiles(new Map([...reader, ['_headers', Buffer.from(text)]])), /static headers/)
  }
  deepEqual(parseStaticHeaders(approved), structuredClone(staticHeaders))
})

test('only the exact _headers name is admitted from public/', () => {
  for (const name of ['_redirects', 'worksheets/journal.pdf', 'images/cover.png', 'assets/_headers', '_headers.bak']) {
    throws(() => assertReaderFiles(new Map([...reader, [name, Buffer.from('x')]])), /Unexpected/, name)
  }
})

test('staging configuration rejects production and extra configuration', () => {
  assertStagingConfig(structuredClone(staging))
  throws(() => assertStagingConfig({ ...staging, vars: { ...staging.vars, SANITY_DATASET: 'production' } }), /differs/)
  throws(() => assertStagingConfig({ ...staging, assets: { ...staging.assets, run_worker_first: [] } }), /differs/)
  throws(() => assertStagingConfig({ ...staging, env: { production: {} } }), /differs/)
})

test('reader bundle checks require the shell and reject sensitive modules, scripts and assets', () => {
  const shell = 'src/readerShell/R06ReaderShell.tsx'
  assertReaderModules([shell])
  throws(() => assertReaderModules([]), /missing/)
  for (const path of ['src/App.tsx', 'src/cms/sanity/readPublishedChallenges.ts',
    'src/components/InteractiveChallengeLab.tsx', 'src/accountAuth/provider.ts']) {
    throws(() => assertReaderModules([shell, path]), /disallowed/)
  }
  assertReaderFiles(reader)
  for (const marker of ['CANARY.api.sanity.io', 'SANITY_READ_TOKEN', '/auth/v1/token', 'Developer Studio']) {
    const altered = new Map(reader)
    altered.set(entry, Buffer.concat([altered.get(entry), Buffer.from(marker)]))
    throws(() => assertReaderFiles(altered), /disallowed/)
  }
  throws(() => assertReaderFiles(new Map([...reader, ['assets/entry.js.map', Buffer.from('{}')]])), /Unexpected/)
  throws(() => assertReaderFiles(new Map([...reader, [entry, Buffer.from('/api/challenges')]])), /gateway route/)
})

test('reader entry script must resolve from the staging origin root', () => {
  for (const src of ['./assets/entry.js', 'assets/entry.js', '//example.test/assets/entry.js']) {
    const altered = new Map(reader)
    altered.set('index.html', Buffer.from(`<script type="module" src="${src}"></script>`))
    throws(() => assertReaderFiles(altered), /root-relative entry script/)
  }
})

test('artifact verification requires an external manifest hash, exact source and exact file set', async () => {
  const root = await mkdtemp(join(tmpdir(), 'test-r06-artifact-'))
  try {
    await mkdir(join(root, 'dist/assets'), { recursive: true })
    const files = new Map([...reader].map(([name, bytes]) => ['dist/' + name, bytes]))
    files.set('worker.js', Buffer.from('compiled worker'))
    for (const [name, bytes] of files) await writeFile(join(root, name), bytes)
    const inventory = describeFiles(files)
    const manifest = {
      schema: 1, channel: 'r06-staging-guest', mode: 'production', sourceCommit: commit,
      sourceTree: commit,
      inputs: {
        packageLockSha256: 'f'.repeat(64),
        stagingConfigSha256: 'f'.repeat(64),
        toolingSha256: Object.fromEntries(['preflight', 'client-build', 'staging-profile', 'verify-staging']
          .map(name => ['r06-' + name + '.mjs', 'f'.repeat(64)])),
      },
      toolchain: {
        platform: 'linux', arch: 'x64', node: '24.22.1', npm: '11.9.0', typescript: '5.9.3', vite: '7.3.7', wrangler: '4.158.0',
      },
      flags, staging, artifactSha256: sha256(JSON.stringify(inventory)), files: inventory,
    }
    const manifestBytes = JSON.stringify(manifest)
    const digest = sha256(manifestBytes)
    await writeFile(join(root, 'manifest.json'), manifestBytes)
    deepEqual((await verifyArtifact(root, commit, digest)).manifest, manifest)
    await rejects(verifyArtifact(root, 'b'.repeat(40), digest), /identity/)
    await rejects(verifyArtifact(root, commit, '0'.repeat(64)), /recorded SHA-256/)
    await writeFile(join(root, 'worker.js'), 'altered')
    await rejects(verifyArtifact(root, commit, digest), /file contents/)
    await writeFile(join(root, 'worker.js'), files.get('worker.js'))
    await writeFile(join(root, 'dist/assets/extra.js'), 'unexpected')
    await rejects(verifyArtifact(root, commit, digest), /file contents/)
    await rm(join(root, 'dist/assets/extra.js'))
    await writeFile(join(root, 'dist/_headers'), '/*\n  X-Frame-Options: SAMEORIGIN\n')
    await rejects(verifyArtifact(root, commit, digest), /file contents|static headers/)
    await rm(join(root, 'dist/_headers'))
    await rejects(verifyArtifact(root, commit, digest), /file contents|static headers/)
    await writeFile(join(root, 'dist/_headers'), files.get('dist/_headers'))
    deepEqual((await verifyArtifact(root, commit, digest)).manifest.files.some(f => f.path === 'dist/_headers'), true)
    await symlink('entry.js', join(root, 'dist/assets/link.js'))
    await rejects(verifyArtifact(root, commit, digest), /link/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('anonymous protection only passes an HTTPS Access login redirect to the confirmed team', () => {
  const team = 'example.cloudflareaccess.com'
  const good = 'https://' + team + '/cdn-cgi/access/login/staging'
  deepEqual(isAccessChallenge(302, good, team), true)
  for (const status of [200, 301, 403, 404, 500]) deepEqual(isAccessChallenge(status, good, team), false)
  for (const location of [
    null, '/cdn-cgi/access/login', 'http://' + team + '/cdn-cgi/access/login',
    'https://other.cloudflareaccess.com/cdn-cgi/access/login',
    'https://' + team + '.example.test/cdn-cgi/access/login',
    'https://' + team + '/cdn-cgi/access/login-other',
    'https://user@' + team + '/cdn-cgi/access/login',
  ]) {
    deepEqual(isAccessChallenge(302, location, team), false)
  }
})
