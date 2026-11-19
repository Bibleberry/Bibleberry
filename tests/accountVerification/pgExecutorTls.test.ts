import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import tls from 'node:tls'
import { after, before, test } from 'node:test'
import pg from 'pg'
import { buildPgClientConfig, createPgVerifierExecutor } from '../../scripts/accountVerification/pgSqlExecutor.ts'
import { RuntimeSecret, type VerifierRuntimeConfig } from '../../src/accountVerification/runtimeConfig.ts'
import { isVerifierRuntimeError } from '../../src/accountVerification/runtimeErrors.ts'

/**
 * R13-VERIFY2 — the production `pg` executor's TLS trust policy against REAL TLS handshakes.
 *
 * A minimal fake PostgreSQL endpoint answers the SSLRequest and then performs a genuine TLS
 * handshake with a throw-away self-signed certificate (generated with openssl for this run).
 * No real database and no network beyond loopback.
 */

let dir: string
let certPem: string
let keyPem: string
const servers: net.Server[] = []

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r13v2-tls-'))
  const r = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=db.verifier.test',
    '-addext', 'subjectAltName=DNS:db.verifier.test', '-keyout', path.join(dir, 'key.pem'), '-out', path.join(dir, 'cert.pem')], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  certPem = fs.readFileSync(path.join(dir, 'cert.pem'), 'utf8')
  keyPem = fs.readFileSync(path.join(dir, 'key.pem'), 'utf8')
})

after(() => {
  for (const s of servers) s.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

/** Fake PG endpoint: 'S' + real TLS (then closes), or 'N' (refuses TLS). Counts completed handshakes. */
function fakePg(mode: 'tls' | 'refuse'): Promise<{ port: number; handshakes: () => number }> {
  let handshakes = 0
  const server = net.createServer(socket => {
    socket.once('data', () => {
      if (mode === 'refuse') {
        socket.end('N')
        return
      }
      socket.write('S')
      const secure = new tls.TLSSocket(socket, { isServer: true, cert: certPem, key: keyPem })
      secure.on('secure', () => {
        handshakes += 1
        secure.destroy()
      })
      secure.on('error', () => socket.destroy())
    })
  })
  servers.push(server)
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ port: (server.address() as net.AddressInfo).port, handshakes: () => handshakes })))
}

function db(port: number, tlsPolicy: VerifierRuntimeConfig['database']['tls'], servername = 'db.verifier.test'): VerifierRuntimeConfig['database'] {
  return {
    host: servername,
    port,
    database: 'postgres',
    user: 'award_verifier_svc',
    password: new RuntimeSecret('pw-DO-NOT-LEAK'),
    tls: tlsPolicy,
    connectTimeoutMs: 2_000,
    statementTimeoutMs: 2_000,
  }
}

/** Route every hostname to the loopback fake while keeping the TLS servername under test. */
function routedFactory(port: number) {
  return (config: pg.ClientConfig) => new pg.Client({ ...config, host: '127.0.0.1', port })
}

async function attempt(config: VerifierRuntimeConfig['database'], port: number) {
  const executor = createPgVerifierExecutor(config, routedFactory(port))
  try {
    await executor.connect()
    return null
  } catch (error) {
    return error
  } finally {
    await executor.close()
  }
}

test('client config: verify-full always rejects unauthorized certs and pins the hostname; disable is plain only', () => {
  const full = buildPgClientConfig(db(5432, { mode: 'verify-full', caPem: certPem }))
  assert.deepEqual(full.ssl, { rejectUnauthorized: true, minVersion: 'TLSv1.2', ca: certPem, servername: 'db.verifier.test' })
  const system = buildPgClientConfig(db(5432, { mode: 'verify-full', caPem: null }))
  assert.deepEqual(system.ssl, { rejectUnauthorized: true, minVersion: 'TLSv1.2', servername: 'db.verifier.test' })
  assert.equal(buildPgClientConfig(db(5432, { mode: 'disable' }, '127.0.0.1')).ssl, false)
  assert.equal('connectionString' in full, false, 'never a connection URL')
})

test('self-signed / untrusted server certificate is refused (no silent unverified TLS)', async () => {
  const { port, handshakes } = await fakePg('tls')
  const error = await attempt(db(port, { mode: 'verify-full', caPem: null }), port)
  assert.ok(isVerifierRuntimeError(error), String(error))
  assert.equal(error.category, 'authorization')
  assert.equal(error.code, 'TLS_VERIFICATION_FAILED')
  assert.equal(handshakes(), 0, 'the client aborted the handshake')
})

test('hostname mismatch is refused even when the CA is trusted', async () => {
  const { port } = await fakePg('tls')
  const error = await attempt(db(port, { mode: 'verify-full', caPem: certPem }, 'other.verifier.test'), port)
  assert.ok(isVerifierRuntimeError(error), String(error))
  assert.equal(error.code, 'TLS_VERIFICATION_FAILED')
})

test('trusted CA + matching hostname completes the TLS handshake (then the fake closes: transient)', async () => {
  const { port, handshakes } = await fakePg('tls')
  const error = await attempt(db(port, { mode: 'verify-full', caPem: certPem }), port)
  assert.equal(handshakes(), 1, 'verified handshake succeeded')
  assert.ok(isVerifierRuntimeError(error))
  assert.equal(error.category, 'transient', 'a closed connection after TLS is a transport failure')
})

test('a server that refuses TLS is an authorization failure, never a plaintext fallback', async () => {
  const { port } = await fakePg('refuse')
  const error = await attempt(db(port, { mode: 'verify-full', caPem: certPem }), port)
  assert.ok(isVerifierRuntimeError(error), String(error))
  assert.equal(error.category, 'authorization')
  assert.equal(error.code, 'TLS_UNAVAILABLE')
  assert.equal(String(error.message).includes('pw-DO-NOT-LEAK'), false)
})
