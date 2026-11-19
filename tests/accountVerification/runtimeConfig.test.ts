import assert from 'node:assert/strict'
import { inspect } from 'node:util'
import test from 'node:test'
import {
  FORBIDDEN_AMBIENT_ENV,
  RuntimeSecret,
  parseVerifierRuntimeConfig,
  type EnvRecord,
} from '../../src/accountVerification/runtimeConfig.ts'
import { isVerifierRuntimeError } from '../../src/accountVerification/runtimeErrors.ts'

const DB_PASSWORD = 'db-password-DO-NOT-LEAK-71c2'
const SANITY_TOKEN = 'sanity-token-DO-NOT-LEAK-55ab'
const CA = '-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----\n'

const files: Record<string, string> = {
  '/run/secrets/db_password': `${DB_PASSWORD}\n`,
  '/run/secrets/sanity_token': SANITY_TOKEN,
  '/run/secrets/ca.pem': CA,
  '/run/secrets/not-a-cert': 'hello',
}
const readFile = (p: string) => {
  if (!(p in files)) throw new Error(`ENOENT ${p}`)
  return files[p]
}

const base: EnvRecord = {
  AWARD_VERIFIER_DB_HOST: 'db.example.internal',
  AWARD_VERIFIER_DB_USER: 'bibleberry_award_verifier_svc',
  AWARD_VERIFIER_DB_PASSWORD_FILE: '/run/secrets/db_password',
  AWARD_VERIFIER_SANITY_PROJECT_ID: '80016lrq',
  AWARD_VERIFIER_SANITY_DATASET: 'staging',
  AWARD_VERIFIER_SANITY_READ_TOKEN_FILE: '/run/secrets/sanity_token',
}

function parse(env: EnvRecord) {
  return parseVerifierRuntimeConfig(env, { readFile })
}

function expectConfigError(env: EnvRecord, variable: RegExp, label: string) {
  try {
    parse(env)
    assert.fail(`${label}: expected a configuration error`)
  } catch (error) {
    assert.ok(isVerifierRuntimeError(error) && error.category === 'configuration', `${label}: ${String(error)}`)
    assert.match(error.message, variable, label)
    for (const secret of [DB_PASSWORD, SANITY_TOKEN, 'db.example.internal', 'evil.example', 'hunter2']) {
      assert.equal(error.message.includes(secret), false, `${label}: error echoed a configured value`)
    }
  }
}

test('defaults: verify-full TLS against the platform trust store, bounded caps, secrets from files', () => {
  const config = parse(base)
  assert.deepEqual(config.database.tls, { mode: 'verify-full', caPem: null })
  assert.equal(config.database.port, 5432)
  assert.equal(config.database.database, 'postgres')
  assert.equal(config.database.password.reveal(), DB_PASSWORD, 'single trailing newline of a mounted secret is dropped')
  assert.equal(config.sanity.readToken.reveal(), SANITY_TOKEN)
  assert.deepEqual(config.limits, { maxClaimsPerBatch: 100, maxBatches: 5, deadlineMs: 120000, maxAttempts: 3, retryBaseDelayMs: 500 })
  assert.equal(config.runId, null)

  const serialized = JSON.stringify(config) + inspect(config, { depth: 10 }) + String(config.database.password)
  assert.equal(serialized.includes(DB_PASSWORD), false)
  assert.equal(serialized.includes(SANITY_TOKEN), false)
  assert.equal(new RuntimeSecret('x').toJSON(), '<redacted>')
})

test('TLS policy is explicit and fails closed: no unverified TLS, plaintext only on loopback', () => {
  assert.deepEqual(parse({ ...base, AWARD_VERIFIER_DB_TLS_CA_FILE: '/run/secrets/ca.pem' }).database.tls, { mode: 'verify-full', caPem: CA })
  for (const host of ['127.0.0.1', '::1', 'localhost']) {
    assert.deepEqual(parse({ ...base, AWARD_VERIFIER_DB_HOST: host, AWARD_VERIFIER_DB_TLS: 'disable' }).database.tls, { mode: 'disable' })
  }
  expectConfigError({ ...base, AWARD_VERIFIER_DB_TLS: 'disable' }, /DB_TLS.*loopback/, 'plaintext to a remote host')
  expectConfigError({ ...base, AWARD_VERIFIER_DB_HOST: '10.0.0.5', AWARD_VERIFIER_DB_TLS: 'disable' }, /DB_TLS/, 'plaintext to a private IP')
  for (const mode of ['require', 'prefer', 'allow', 'no-verify', 'verify-ca', 'insecure']) {
    expectConfigError({ ...base, AWARD_VERIFIER_DB_TLS: mode }, /DB_TLS/, `mode ${mode}`)
  }
  expectConfigError({ ...base, AWARD_VERIFIER_DB_TLS_CA_FILE: '/run/secrets/not-a-cert' }, /CA_FILE.*PEM/, 'non-PEM CA')
  expectConfigError({ ...base, AWARD_VERIFIER_DB_TLS_CA_FILE: '/run/secrets/missing.pem' }, /CA_FILE could not be read/, 'missing CA')
  expectConfigError({ ...base, AWARD_VERIFIER_DB_HOST: '127.0.0.1', AWARD_VERIFIER_DB_TLS: 'disable', AWARD_VERIFIER_DB_TLS_CA_FILE: '/run/secrets/ca.pem' }, /CA_FILE/, 'CA with TLS disabled')
})

test('never a connection URL, and ambient libpq / Supabase variables are refused', () => {
  for (const name of FORBIDDEN_AMBIENT_ENV) {
    expectConfigError({ ...base, [name]: 'postgresql://postgres:hunter2@evil.example/postgres' }, new RegExp(name), name)
  }
  expectConfigError({ ...base, AWARD_VERIFIER_DB_HOST: 'postgresql://u:hunter2@evil.example' }, /DB_HOST is invalid/, 'URL as host')
  expectConfigError({ ...base, AWARD_VERIFIER_DB_HOST: 'evil.example/postgres?sslmode=disable' }, /DB_HOST is invalid/, 'host with path')
})

test('the login must be a dedicated verifier LOGIN: owner, API and platform roles are refused', () => {
  for (const user of ['postgres', 'service_role', 'authenticator', 'authenticated', 'anon', 'supabase_admin',
    'supabase_auth_admin', 'account_award_issuer', 'account_award_verifier', 'account_reconciler', 'pg_monitor',
    'postgres.abcdefghijklmnopqrst', 'service_role.abcdefghijklmnopqrst']) {
    expectConfigError({ ...base, AWARD_VERIFIER_DB_USER: user }, /DB_USER/, user)
  }
  expectConfigError({ ...base, AWARD_VERIFIER_DB_USER: 'Robert"; DROP' }, /DB_USER is invalid/, 'quoted identifier')
  assert.equal(parse({ ...base, AWARD_VERIFIER_DB_USER: 'award_verifier_svc.abcdefghijklmnopqrst' }).database.user,
    'award_verifier_svc.abcdefghijklmnopqrst', 'pooler tenant suffix allowed')
})

test('credential custody: file or variable, never both; missing / unreadable / malformed secrets refused', () => {
  const direct = { ...base, AWARD_VERIFIER_DB_PASSWORD_FILE: undefined, AWARD_VERIFIER_DB_PASSWORD: DB_PASSWORD }
  assert.equal(parse(direct).database.password.reveal(), DB_PASSWORD)
  expectConfigError({ ...base, AWARD_VERIFIER_DB_PASSWORD: DB_PASSWORD }, /DB_PASSWORD and its _FILE variant are both set/, 'both')
  expectConfigError({ ...base, AWARD_VERIFIER_DB_PASSWORD_FILE: undefined }, /DB_PASSWORD or its _FILE variant is required/, 'missing')
  expectConfigError({ ...base, AWARD_VERIFIER_DB_PASSWORD_FILE: '/run/secrets/nope' }, /DB_PASSWORD_FILE could not be read/, 'unreadable')
  expectConfigError({ ...base, AWARD_VERIFIER_DB_PASSWORD_FILE: 'relative/path' }, /absolute path/, 'relative path')
  expectConfigError({ ...base, AWARD_VERIFIER_SANITY_READ_TOKEN_FILE: undefined }, /SANITY_READ_TOKEN or its _FILE variant is required/, 'token missing')
  files['/run/secrets/two-lines'] = 'a\nb\n'
  expectConfigError({ ...base, AWARD_VERIFIER_SANITY_READ_TOKEN_FILE: '/run/secrets/two-lines' }, /SANITY_READ_TOKEN has an invalid format/, 'multi-line')
})

test('Sanity: only approved datasets, valid project IDs; caps and run ID are bounded', () => {
  assert.equal(parse({ ...base, AWARD_VERIFIER_SANITY_DATASET: 'production' }).sanity.dataset, 'production')
  for (const dataset of ['berrymark-development', 'development', 'drafts', 'production2']) {
    expectConfigError({ ...base, AWARD_VERIFIER_SANITY_DATASET: dataset }, /SANITY_DATASET must be an approved dataset/, dataset)
  }
  expectConfigError({ ...base, AWARD_VERIFIER_SANITY_PROJECT_ID: 'Bad!' }, /SANITY_PROJECT_ID/, 'project id')
  const capped: [string, string][] = [
    ['MAX_CLAIMS_PER_BATCH', '501'], ['MAX_CLAIMS_PER_BATCH', '0'], ['MAX_BATCHES', '21'], ['DEADLINE_MS', '900001'],
    ['MAX_ATTEMPTS', '6'], ['MAX_ATTEMPTS', '-1'], ['DB_STATEMENT_TIMEOUT_MS', '1e9'], ['DB_PORT', '70000'],
  ]
  for (const [name, value] of capped) {
    expectConfigError({ ...base, [`AWARD_VERIFIER_${name}`]: value }, new RegExp(name), `${name}=${value}`)
  }
  assert.equal(parse({ ...base, AWARD_VERIFIER_RUN_ID: 'sched-2026-11-19T0400' }).runId, 'sched-2026-11-19T0400')
  expectConfigError({ ...base, AWARD_VERIFIER_RUN_ID: 'has space' }, /RUN_ID/, 'run id charset')
  expectConfigError({ ...base, AWARD_VERIFIER_RUN_ID: 'x'.repeat(49) }, /RUN_ID/, 'run id length')
})
