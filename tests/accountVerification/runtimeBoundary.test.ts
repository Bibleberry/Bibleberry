import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

/**
 * R13-VERIFY2 boundary guards: the private verifier runtime, its `pg` driver and its credentials
 * can never enter a browser / native bundle or a public route.
 */

const ROOT = process.cwd()
const SRC = path.join(ROOT, 'src')
const VERIFY_DIR = path.join(SRC, 'accountVerification')

function walk(dir: string, filter: (file: string) => boolean, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      walk(full, filter, out)
    } else if (filter(full)) {
      out.push(full)
    }
  }
  return out
}

const isSource = (f: string) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f)
const PG_IMPORT = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]pg(?:-[a-z-]+)?(?:\/[^'"]*)?['"]/

test('no file under src/ imports the pg driver, Node built-ins from the verifier, or the verifier CLI', () => {
  const offenders: string[] = []
  for (const file of walk(SRC, isSource)) {
    const text = fs.readFileSync(file, 'utf8')
    const rel = path.relative(ROOT, file)
    if (PG_IMPORT.test(text)) offenders.push(`${rel}: imports pg`)
    if (/(?:from\s+|import\s*\(\s*)['"][^'"]*scripts\/accountVerification/.test(text)) offenders.push(`${rel}: imports the verifier CLI/executor`)
    if (file.startsWith(VERIFY_DIR + path.sep)) {
      if (/from\s+['"]node:/.test(text)) offenders.push(`${rel}: Node built-in in runtime-neutral verifier core`)
      if (/\bprocess\.(env|exit|on)\b/.test(text)) offenders.push(`${rel}: process access in verifier core`)
      if (/console\.(log|info|warn|error|debug)/.test(text)) offenders.push(`${rel}: logging in verifier core`)
    } else if (/AWARD_VERIFIER_|account_issuance|accountVerification/.test(text)) {
      offenders.push(`${rel}: browser code references the private verifier`)
    }
  }
  assert.deepEqual(offenders, [])
})

test('only scripts/accountVerification imports pg; nothing anywhere relaxes TLS verification', () => {
  const pgUsers = walk(ROOT, f => isSource(f) && !f.includes(`${path.sep}dist${path.sep}`))
    .filter(f => PG_IMPORT.test(fs.readFileSync(f, 'utf8')))
    .map(f => path.relative(ROOT, f))
    .filter(f => !f.startsWith(`tests${path.sep}`))
  assert.deepEqual(pgUsers, [path.join('scripts', 'accountVerification', 'pgSqlExecutor.ts')])

  const relaxed: string[] = []
  for (const file of walk(ROOT, f => isSource(f) || /\.(sh|json|toml|ya?ml)$/.test(f))) {
    const rel = path.relative(ROOT, file)
    if (rel.startsWith('dist') || rel === 'package-lock.json' || rel === path.join('tests', 'accountVerification', 'runtimeBoundary.test.ts')) continue
    const text = fs.readFileSync(file, 'utf8')
    if (/rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED|sslmode=(?:require|prefer|allow|no-verify)\b/.test(text)) relaxed.push(rel)
  }
  assert.deepEqual(relaxed, [], 'no unverified-TLS escape hatch')
})

/** Static import graph from the browser entry: the verifier must be unreachable. */
test('the browser entry import graph never reaches src/accountVerification or pg', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  const entries = [...html.matchAll(/<script[^>]+src="\/([^"]+)"/g)].map(m => path.join(ROOT, m[1]))
  assert.ok(entries.length > 0, 'index.html declares a module entry')
  const seen = new Set<string>()
  const bare = new Set<string>()
  const resolve = (from: string, spec: string): string | null => {
    const base = spec.startsWith('@/') ? path.join(SRC, spec.slice(2)) : path.resolve(path.dirname(from), spec)
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
    }
    return null
  }
  const queue = [...entries]
  while (queue.length) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    if (!/\.(tsx?|jsx?)$/.test(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    for (const m of text.matchAll(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g)) {
      const spec = m[1] ?? m[2] ?? m[3]
      if (spec.startsWith('.') || spec.startsWith('@/')) {
        const target = resolve(file, spec)
        if (target) queue.push(target)
      } else {
        bare.add(spec.split('/')[0])
      }
    }
  }
  const reached = [...seen].map(f => path.relative(ROOT, f))
  assert.ok(reached.length > 20, `walked the real app graph (${reached.length} files)`)
  assert.deepEqual(reached.filter(f => f.includes('accountVerification') || f.startsWith('scripts')), [])
  assert.equal(bare.has('pg'), false)
})

test('a real production build contains no verifier code, SQL port names, env names or pg driver', { timeout: 240_000 }, () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bibleberry-verify2-bundle-'))
  try {
    const vite = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
    const build = spawnSync(process.execPath, [vite, 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'production' },
    })
    assert.equal(build.status, 0, `vite build failed: ${build.stderr}`)
    const files = walk(outDir, () => true)
    assert.ok(files.some(f => f.endsWith('.js')), 'build produced JavaScript')
    const markers = [
      'account_issuance', 'list_pending_award_claims', 'admit_verified_award', 'record_verification_deferral',
      'get_claim_verification_context', 'AWARD_VERIFIER_', 'bibleberry-award-verifier', 'account_award_verifier',
      'r13-verify2', 'TRUSTED_AWARD_VERIFICATION', 'priorRosters', 'pg-protocol', 'pgpass', 'SASL', 'scram-sha-256',
    ]
    const hits: string[] = []
    for (const file of files) {
      const text = fs.readFileSync(file, 'latin1')
      for (const marker of markers) if (text.includes(marker)) hits.push(`${path.relative(outDir, file)}: ${marker}`)
    }
    assert.deepEqual(hits, [], 'browser / Capacitor webDir bundle must not contain the private verifier')
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true })
  }
})

test('no public route, Worker or Data API exposure of the verifier', () => {
  const routeFiles = [
    ...walk(path.join(SRC, 'gateway'), isSource),
    ...walk(path.join(ROOT, 'worker'), isSource),
    ...walk(path.join(ROOT, 'functions'), isSource),
    ...walk(path.join(ROOT, 'supabase', 'functions'), isSource),
  ]
  for (const file of routeFiles) {
    const text = fs.readFileSync(file, 'utf8')
    assert.equal(/runVerifierOnce|createDatabaseAwardIssuancePort|account_issuance|AWARD_VERIFIER_/.test(text), false, path.relative(ROOT, file))
  }
  const config = fs.readFileSync(path.join(ROOT, 'supabase', 'config.toml'), 'utf8')
  assert.match(config, /^\s*schemas = \["public", "graphql_public"\]/m, 'account_issuance is not a Data API schema')
  for (const wrangler of fs.readdirSync(ROOT).filter(f => /^wrangler.*\.jsonc?$/.test(f))) {
    const text = fs.readFileSync(path.join(ROOT, wrangler), 'utf8')
    assert.equal(/AWARD_VERIFIER|accountVerification|account_issuance/.test(text), false, wrangler)
  }
})
