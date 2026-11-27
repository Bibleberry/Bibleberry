import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { assertReaderFiles, assertStagingConfig, flags, staging } from './r06-staging-profile.mjs'

const tooling = ['r06-preflight.mjs', 'r06-client-build.mjs', 'r06-staging-profile.mjs', 'r06-verify-staging.mjs']
const scriptDir = dirname(fileURLToPath(import.meta.url))
const shaPattern = /^[a-f0-9]{40}$/
const digestPattern = /^[a-f0-9]{64}$/
const configFile = 'wrangler.staging.jsonc'
const manifestFile = 'manifest.json'
const registry = 'https://registry.npmjs.org/'

export const sha256 = input => createHash('sha256').update(input).digest('hex')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    ...options,
  })
  if (result.error || result.status !== 0) throw new Error(`${command} failed (${result.error?.code ?? result.status}).`)
  return result.stdout?.trim()
}

async function filesAt(directory) {
  if (!(await lstat(directory)).isDirectory()) throw new Error('Expected a real artifact directory.')
  const files = new Map()
  async function walk(prefix) {
    const entries = await readdir(join(directory, prefix), { withFileTypes: true })
    if (entries.length === 0) throw new Error('Artifact directory contains an empty directory.')
    for (const entry of entries.sort((a, b) => a.name < b.name ? -1 : Number(a.name > b.name))) {
      const name = prefix + entry.name
      if (entry.isDirectory()) await walk(name + '/')
      else if (entry.isFile()) files.set(name, await readFile(join(directory, name)))
      else throw new Error('Artifact contains a link or non-regular file.')
    }
  }
  await walk('')
  return files
}

export function describeFiles(files) {
  return [...files].sort(([a], [b]) => a < b ? -1 : Number(a > b)).map(([path, bytes]) => ({
    path, bytes: bytes.length, sha256: sha256(bytes),
  }))
}

function assertArtifactFiles(files) {
  const reader = new Map()
  for (const [name, bytes] of files) {
    if (name.startsWith('dist/')) reader.set(name.slice('dist/'.length), bytes)
    else if (name !== 'worker.js') throw new Error('Artifact contains an unexpected top-level file.')
  }
  if (!files.get('worker.js')?.length) throw new Error('Wrangler Worker bundle is missing.')
  assertReaderFiles(reader)
}

export async function verifyArtifact(directory, sourceCommit, expectedManifestSha256) {
  if (!shaPattern.test(sourceCommit) || !digestPattern.test(expectedManifestSha256)) {
    throw new Error('Verification requires a full source SHA and an independently recorded manifest SHA-256.')
  }
  const files = await filesAt(directory)
  const manifestBytes = files.get(manifestFile)
  if (!manifestBytes || sha256(manifestBytes) !== expectedManifestSha256) {
    throw new Error('Manifest does not match the recorded SHA-256.')
  }
  const manifest = JSON.parse(manifestBytes)
  files.delete(manifestFile)
  assertArtifactFiles(files)
  const inventory = describeFiles(files)
  if (
    manifest.schema !== 1 ||
    manifest.sourceCommit !== sourceCommit ||
    manifest.mode !== 'production' ||
    manifest.channel !== 'r06-staging-guest' ||
    JSON.stringify(manifest.flags) !== JSON.stringify(flags) ||
    manifest.artifactSha256 !== sha256(JSON.stringify(inventory)) ||
    JSON.stringify(manifest.files) !== JSON.stringify(inventory)
  ) {
    throw new Error('Artifact identity or file contents do not match the manifest.')
  }
  assertStagingConfig(manifest.staging)
  return { manifest, reader: new Map([...files].filter(([path]) => path.startsWith('dist/'))
    .map(([path, bytes]) => [path.slice('dist/'.length), bytes])) }
}

async function buildArtifact(sourceCommit, directory, cacheDirectory) {
  if (!shaPattern.test(sourceCommit)) throw new Error('Build requires a full Git commit SHA.')
  const repo = run('git', ['-C', scriptDir, 'rev-parse', '--show-toplevel'])
  const git = args => run('git', ['-C', repo, ...args])
  if (git(['rev-parse', '--verify', sourceCommit + '^{commit}']) !== sourceCommit) {
    throw new Error('Build source must be an exact commit.')
  }
  if (process.platform !== 'linux' || process.arch !== 'x64' || Number(process.versions.node.split('.')[0]) < 22) {
    throw new Error('Use Linux x64 and Node 22 or later. Match recorded versions for a byte-for-byte rebuild.')
  }

  const workspace = await mkdtemp(join(tmpdir(), 'bibleberry-r06-'))
  try {
    const cwd = join(workspace, 'source')
    const home = join(workspace, 'home')
    await mkdir(cwd)
    await mkdir(home)
    const archive = join(workspace, 'source.tar')
    git(['archive', '--format=tar', '--output', archive, sourceCommit])
    const env = {
      PATH: [dirname(process.execPath), '/usr/local/bin', '/usr/bin', '/bin'].join(':'),
      HOME: home,
      XDG_CONFIG_HOME: join(home, '.config'),
      CI: 'true',
      LANG: 'C.UTF-8',
      TZ: 'UTC',
      WRANGLER_SEND_METRICS: 'false',
    }
    run('tar', ['-xf', archive, '-C', cwd], { env })
    for (const name of await readdir(cwd)) {
      if (/^(?:\.env(?:\.|$)|\.dev\.vars(?:\.|$)|\.npmrc$|dist$|node_modules$)/.test(name)) {
        throw new Error('Pinned source contains an unexpected build input.')
      }
    }

    const log = { cwd, env, stdio: 'inherit' }
    const npm = run('npm', ['--version'], { cwd, env })
    const cacheArgs = cacheDirectory ? ['--cache', resolve(cacheDirectory)] : []
    run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--userconfig=' + join(home, 'user.npmrc'),
      '--globalconfig=' + join(home, 'global.npmrc'), '--registry=' + registry, ...cacheArgs], log)

    const stagedConfig = await readFile(join(cwd, configFile))
    // TypeScript provides a JSONC parser for the comments in the existing Wrangler config.
    const { default: ts } = await import(pathToFileURL(join(cwd, 'node_modules/typescript/lib/typescript.js')))
    const parsed = ts.parseConfigFileTextToJson(configFile, stagedConfig.toString('utf8'))
    if (parsed.error) throw new Error('Staging Wrangler configuration could not be parsed.')
    assertStagingConfig(parsed.config)

    const buildTools = join(cwd, '.r06-preflight')
    await mkdir(buildTools)
    const toolDigests = {}
    for (const name of tooling) {
      const bytes = await readFile(join(scriptDir, name))
      toolDigests[name] = sha256(bytes)
      await writeFile(join(buildTools, name), bytes, { flag: 'wx' })
    }
    run(process.execPath, ['node_modules/typescript/bin/tsc', '-b'], log)
    run(process.execPath, ['.r06-preflight/r06-client-build.mjs'], {
      ...log, env: { ...env, ...flags, NODE_ENV: 'production' },
    })

    const dist = join(cwd, 'dist')
    const reader = await filesAt(dist)
    assertReaderFiles(reader)
    const dryRun = join(cwd, '.r06-wrangler')
    run(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'deploy', '--dry-run',
      '--config', configFile, '--outdir', dryRun], log)
    if (JSON.stringify(describeFiles(reader)) !== JSON.stringify(describeFiles(await filesAt(dist)))) {
      throw new Error('Reader bytes changed during Wrangler dry-run.')
    }
    const worker = await readFile(join(dryRun, 'worker.js'))
    const files = new Map([...reader].map(([name, bytes]) => ['dist/' + name, bytes]))
    files.set('worker.js', worker)
    assertArtifactFiles(files)
    const inventory = describeFiles(files)
    const packageVersion = async name => JSON.parse(await readFile(join(cwd, 'node_modules', name, 'package.json'))).version
    const manifest = {
      schema: 1,
      channel: 'r06-staging-guest',
      sourceCommit,
      sourceTree: git(['rev-parse', sourceCommit + '^{tree}']),
      mode: 'production',
      flags,
      staging,
      inputs: {
        packageLockSha256: sha256(await readFile(join(cwd, 'package-lock.json'))),
        stagingConfigSha256: sha256(stagedConfig),
        toolingSha256: toolDigests,
      },
      toolchain: {
        platform: process.platform,
        arch: process.arch,
        node: process.versions.node,
        npm,
        typescript: await packageVersion('typescript'),
        vite: await packageVersion('vite'),
        wrangler: await packageVersion('wrangler'),
      },
      artifactSha256: sha256(JSON.stringify(inventory)),
      files: inventory,
    }
    const manifestBytes = JSON.stringify(manifest, null, 2) + '\n'
    const manifestSha256 = sha256(manifestBytes)

    // Refuse an existing destination. Only remove a directory created by this invocation.
    await mkdir(directory)
    try {
      for (const [name, bytes] of files) {
        const destination = join(directory, name)
        await mkdir(dirname(destination), { recursive: true })
        await writeFile(destination, bytes, { flag: 'wx' })
      }
      await writeFile(join(directory, manifestFile), manifestBytes, { flag: 'wx' })
      await verifyArtifact(directory, sourceCommit, manifestSha256)
    } catch (error) {
      await rm(directory, { recursive: true, force: true })
      throw error
    }
    console.log(JSON.stringify({ sourceCommit, manifestSha256, artifactSha256: manifest.artifactSha256 }, null, 2))
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
}

async function main([command, commit, arg, extra, ...rest]) {
  if (rest.length === 0 && command === 'build' && commit && arg) {
    await buildArtifact(commit, resolve(arg), extra)
  } else if (rest.length === 0 && command === 'verify' && commit && arg && extra) {
    const { manifest } = await verifyArtifact(resolve(extra), commit, arg)
    console.log(`Verified R06 artifact ${manifest.artifactSha256} for ${manifest.sourceCommit}.`)
  } else {
    throw new Error('Usage: r06-preflight.mjs build <commit> <new-output-dir> [npm-cache-dir] | verify <commit> <manifest-sha256> <output-dir>')
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
