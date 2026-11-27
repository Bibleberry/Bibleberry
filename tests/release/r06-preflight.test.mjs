import { deepEqual, rejects, throws } from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { describeFiles, sha256, verifyArtifact } from '../../scripts/release/r06-preflight.mjs'
import { assertReaderFiles, assertReaderModules, assertStagingConfig, flags, staging } from '../../scripts/release/r06-staging-profile.mjs'
import { isAccessChallenge } from '../../scripts/release/r06-verify-staging.mjs'

const commit = 'a'.repeat(40)
const entry = 'assets/entry.js'
const reader = new Map([
  ['index.html', Buffer.from('<script type="module" src="./assets/entry.js"></script>')],
  ['favicon.svg', Buffer.from('<svg/>')],
  [entry, Buffer.from('/api/challenges /api/months/ /api/library/months /api/news')],
])

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
