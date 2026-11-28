import { chromium, expect } from '@playwright/test'
import { verifyArtifact } from './r06-preflight.mjs'
import { staging, staticHeaders } from './r06-staging-profile.mjs'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const stagingOrigin = staging.vars.ALLOWED_ORIGINS.split(',')[0]
const browserOrigin = 'https://r06-preflight.test'
const publicFontStylesheet = 'https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600&family=Poppins:wght@400;500;600&display=swap'
const directEntryPath = '/challenge/preflight-unavailable'
const hashEntryPath = '/#' + directEntryPath
const challengePath = '/api/challenges/preflight-unavailable'
const releaseRoutes = /^\/api\/(?:challenges(?:\/[^/]+)?|months\/[^/]+|library\/months|news)$/
const contentTypes = {
  html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml',
  png: 'image/png', webp: 'image/webp', woff: 'font/woff', woff2: 'font/woff2',
}

export function isAccessChallenge(status, location, teamHost) {
  if (status !== 302 || !location || !isTeamHost(teamHost)) return false
  try {
    const url = new URL(location)
    return url.origin === 'https://' + teamHost &&
      !url.username && !url.password && /^\/cdn-cgi\/access\/login(?:\/|$)/.test(url.pathname)
  } catch {
    return false
  }
}

function isTeamHost(host) {
  return typeof host === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/.test(host)
}

async function verifyPerimeter(reader, teamHost, liveAsset) {
  if (!isTeamHost(teamHost)) throw new Error('Provide the independently confirmed Cloudflare Access team hostname.')
  if (!/^\/assets\/[\w.-]+-[\w-]{8}\.(?:js|css)$/.test(liveAsset)) {
    throw new Error('Provide a hashed JS or CSS asset path verified on the active staging version.')
  }
  const paths = new Set(['/', liveAsset, '/api', '/api/challenges', challengePath, '/api/months/2026-11',
    '/api/library/months', '/api/news', ...[...reader.keys()].map(path => '/' + path)])
  let blocked = false
  for (const path of paths) {
    try {
      const response = await fetch(stagingOrigin + path, {
        redirect: 'manual', credentials: 'omit', signal: AbortSignal.timeout(8000),
      })
      const protectedByAccess = isAccessChallenge(response.status, response.headers.get('location'), teamHost)
      await response.body?.cancel()
      console.log(`${protectedByAccess ? 'ACCESS REDIRECT' : 'HOLD'} ${path} HTTP ${response.status}`)
      blocked ||= !protectedByAccess
    } catch {
      console.log(`HOLD ${path} (no verified HTTP response)`)
      blocked = true
    }
  }
  if (blocked) throw new Error('Anonymous staging perimeter check is incomplete or failed.')
}

async function smokeReader(reader) {
  const browser = await chromium.launch()
  try {
    const smokeCases = [
      { path: directEntryPath, failure: 404 },
      { path: hashEntryPath, failure: 404 },
      { path: hashEntryPath, failure: 503 },
      { path: hashEntryPath, failure: 200 },
    ]
    for (const { path, failure } of smokeCases) {
      const context = await browser.newContext({ serviceWorkers: 'block' })
      try {
        const page = await context.newPage()
        page.setDefaultTimeout(5000)
        const unexpected = []
        const gatewayRequests = []
        const servedAssets = new Set()
        await context.route('**/*', async route => {
          const request = route.request()
          const url = new URL(request.url())
          // Keep the browser check offline while allowing the existing public font stylesheet.
          if (request.method() === 'GET' && request.url() === publicFontStylesheet) {
            return route.fulfill({ status: 200, body: '', contentType: 'text/css' })
          }
          if (url.origin !== browserOrigin || request.method() !== 'GET') {
            unexpected.push('Unexpected origin or method')
            return route.abort()
          }

          if (releaseRoutes.test(url.pathname)) {
            gatewayRequests.push(url.pathname)
            return route.fulfill({
              status: url.pathname === challengePath ? failure : 503,
              json: { ok: false },
            })
          }
          // Reproduce the staging SPA fallback for a direct document request.
          const document = request.isNavigationRequest() && (url.pathname === '/' || url.pathname === directEntryPath)
          const name = document ? 'index.html' : url.pathname.slice(1)
          const body = reader.get(name)
          if (!body) {
            unexpected.push('Unexpected resource path: ' + url.pathname)
            return route.abort()
          }
          if (name.startsWith('assets/')) servedAssets.add(url.pathname)
          return route.fulfill({ status: 200, body, contentType: contentTypes[name.split('.').at(-1)] })
        })

        await page.goto(browserOrigin + path)
        if (path === directEntryPath) {
          expect(unexpected).toEqual([])
          await expect(page.locator('.r06-shell')).toBeVisible()
          expect([...servedAssets]).toEqual(expect.arrayContaining([
            expect.stringMatching(/^\/assets\/.*\.js$/),
            expect.stringMatching(/^\/assets\/.*\.css$/),
          ]))
          expect(unexpected).toEqual([])
          console.log('Packaged reader loaded root-based JavaScript and CSS from a direct Challenge URL.')
          continue
        }

        await expect(page.getByRole('heading', { name: 'Challenge unavailable', exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Finish', exact: true })).toHaveCount(0)
        expect(gatewayRequests).toContain(challengePath)
        await page.getByRole('button', { name: 'Return to Today' }).click()
        await expect(page.getByRole('heading', { name: 'Unable to load today’s teaching' })).toBeVisible()
        expect(gatewayRequests.some(path => path.startsWith('/api/months/'))).toBe(true)
        const navigation = page.getByRole('navigation', { name: 'Primary navigation' })
        await expect(navigation.getByRole('button')).toHaveText(['Today', 'Library', 'Collections', 'More'])
        await navigation.getByRole('button', { name: 'More', exact: true }).click()
        await expect.poll(() => gatewayRequests.includes('/api/news')).toBe(true)
        await page.getByRole('button', { name: 'Account & Progress' }).click()
        const account = page.getByTestId('account-status-card')
        await expect(account).toContainText('stored only on this device or browser')
        await expect(account).toContainText('cloud backup, and cross-device sync are not enabled')
        await expect(page.getByRole('button', { name: /sign in|create account|log in/i })).toHaveCount(0)
        await expect(page.getByRole('link', { name: /sign in|create account|log in/i })).toHaveCount(0)
        expect(unexpected).toEqual([])
        console.log(`Packaged reader smoke passed with synthetic Challenge HTTP ${failure}.`)
      } finally {
        await context.close()
      }
    }
  } finally {
    await browser.close()
  }
}

const approvedHeaders = Object.entries(staticHeaders['/*'])
const neutralMonthNotFound = JSON.stringify({ ok: false, error: { kind: 'notFound', message: 'Month not found' } })
const neutralRouteNotFound = JSON.stringify({ ok: false, error: { kind: 'notFound', message: 'Not found' } })

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolvePort(port))
    })
  })
}

/**
 * Serves the verified artifact's own worker.js and dist/ in local workerd (wrangler dev
 * --local) with the reviewed staging profile, then checks real responses: every static path
 * carries exactly the approved headers, the headers file itself is not served, and /api/*
 * keeps the gateway's own unchanged responses without the static headers. No network
 * request leaves the machine: the probed API routes answer before any upstream call.
 */
export async function verifyServedStaticHeaders(directory, reader) {
  const wrangler = join(dirname(fileURLToPath(import.meta.url)), '../../node_modules/wrangler/bin/wrangler.js')
  const work = await mkdtemp(join(tmpdir(), 'bibleberry-r06-headers-'))
  const { $schema: _schema, ...profile } = staging
  const config = {
    ...profile,
    main: join(directory, 'worker.js'),
    no_bundle: true,
    assets: { ...staging.assets, directory: join(directory, 'dist') },
  }
  await mkdir(join(work, 'home'))
  await writeFile(join(work, 'wrangler.json'), JSON.stringify(config))
  const port = await freePort()
  const origin = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, [wrangler, 'dev', '--config', join(work, 'wrangler.json'), '--local',
    '--ip', '127.0.0.1', '--port', String(port), '--persist-to', join(work, 'state'),
    '--var', 'SANITY_READ_TOKEN:r06-local-header-check'], {
    cwd: work,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      PATH: process.env.PATH,
      HOME: join(work, 'home'),
      XDG_CONFIG_HOME: join(work, 'home', '.config'),
      CI: 'true',
      WRANGLER_SEND_METRICS: 'false',
    },
  })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  const exited = new Promise(resolveExit => child.once('exit', resolveExit))

  try {
    const deadline = Date.now() + 60_000
    for (;;) {
      if (child.exitCode !== null) throw new Error('Local workerd exited before serving the artifact.')
      try {
        if ((await fetch(origin + '/', { signal: AbortSignal.timeout(2000) })).ok) break
      } catch {
        // Not listening yet.
      }
      if (Date.now() > deadline) throw new Error('Local workerd did not serve the artifact in time.')
      await new Promise(next => setTimeout(next, 250))
    }

    const get = async (path, init = {}) => {
      const response = await fetch(origin + path, { redirect: 'manual', ...init, signal: AbortSignal.timeout(8000) })
      return { response, body: Buffer.from(await response.arrayBuffer()) }
    }

    const assets = [...reader.keys()].filter(name => /^assets\/.+\.(?:js|css)$/.test(name))
    const staticPaths = [
      ['/', 'index.html'],
      ['/today', 'index.html'],
      ['/challenge/preflight-unavailable', 'index.html'],
      ['/favicon.svg', 'favicon.svg'],
      ...assets.map(name => ['/' + name, name]),
    ]
    for (const [path, file] of staticPaths) {
      const { response, body } = await get(path)
      if (response.status !== 200 || !body.equals(reader.get(file))) {
        throw new Error(`Local workerd did not serve the artifact's ${file} for ${path}.`)
      }
      for (const [name, value] of approvedHeaders) {
        if (response.headers.get(name) !== value) throw new Error(`Static response ${path} lacks approved ${name}.`)
      }
    }
    console.log(`Approved static headers served from the artifact on ${staticPaths.length} paths.`)

    const headersFile = await get('/_headers')
    if (headersFile.body.equals(reader.get('_headers')) || headersFile.body.includes('Permissions-Policy')) {
      throw new Error('The static headers file itself is publicly served.')
    }

    const apiCases = [
      { path: '/api/months/2099-01', status: 404, body: neutralMonthNotFound },
      { path: '/api/preflight-unknown-route', status: 404, body: neutralRouteNotFound },
      { path: '/api/news', status: 204, body: '', init: { method: 'OPTIONS', headers: { Origin: 'https://r06-preflight.test' } } },
    ]
    for (const { path, status, body, init } of apiCases) {
      const { response, body: bytes } = await get(path, init)
      if (response.status !== status || bytes.toString('utf8') !== body || response.headers.get('cache-control') !== 'no-store') {
        throw new Error(`Release Gateway response changed for ${init?.method ?? 'GET'} ${path}.`)
      }
      for (const [name] of approvedHeaders) {
        if (response.headers.has(name)) throw new Error(`Static header ${name} leaked onto ${path}.`)
      }
    }
    console.log('Release Gateway /api/* responses unchanged and carry no static-asset headers.')
  } catch (error) {
    // Wrangler output can include local paths but never secrets; keep it for diagnosis.
    console.error(output.slice(-4000))
    throw error
  } finally {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      // Already gone.
    }
    await Promise.race([exited, new Promise(next => setTimeout(next, 5000))])
    await rm(work, { recursive: true, force: true })
  }
}

async function main([command, commit, digest, directory, teamHost, liveAsset, ...rest]) {
  if (rest.length || !commit || !digest || !directory ||
      !(command === 'smoke' && !teamHost && !liveAsset || command === 'perimeter' && teamHost && liveAsset)) {
    throw new Error('Usage: r06-verify-staging.mjs smoke <commit> <manifest-sha256> <dir> | perimeter <commit> <manifest-sha256> <dir> <confirmed-access-team-host> <live-hashed-asset-path>')
  }
  const { reader } = await verifyArtifact(resolve(directory), commit, digest)
  if (command === 'smoke') {
    await verifyServedStaticHeaders(resolve(directory), reader)
    await smokeReader(reader)
  }
  else await verifyPerimeter(reader, teamHost, liveAsset)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
