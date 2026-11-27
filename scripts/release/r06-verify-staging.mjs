import { chromium, expect } from '@playwright/test'
import { verifyArtifact } from './r06-preflight.mjs'
import { staging } from './r06-staging-profile.mjs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const stagingOrigin = staging.vars.ALLOWED_ORIGINS.split(',')[0]
const browserOrigin = 'https://r06-preflight.test'
const publicFontStylesheet = 'https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600&family=Poppins:wght@400;500;600&display=swap'
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
    for (const failure of [404, 503, 200]) {
      const context = await browser.newContext({ serviceWorkers: 'block' })
      try {
        const page = await context.newPage()
        page.setDefaultTimeout(5000)
        const unexpected = []
        const gatewayRequests = []
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
          const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
          const body = reader.get(name)
          if (!body) {
            unexpected.push('Unexpected resource path')
            return route.abort()
          }
          return route.fulfill({ status: 200, body, contentType: contentTypes[name.split('.').at(-1)] })
        })

        await page.goto(browserOrigin + '/#/challenge/preflight-unavailable')
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

async function main([command, commit, digest, directory, teamHost, liveAsset, ...rest]) {
  if (rest.length || !commit || !digest || !directory ||
      !(command === 'smoke' && !teamHost && !liveAsset || command === 'perimeter' && teamHost && liveAsset)) {
    throw new Error('Usage: r06-verify-staging.mjs smoke <commit> <manifest-sha256> <dir> | perimeter <commit> <manifest-sha256> <dir> <confirmed-access-team-host> <live-hashed-asset-path>')
  }
  const { reader } = await verifyArtifact(resolve(directory), commit, digest)
  if (command === 'smoke') await smokeReader(reader)
  else await verifyPerimeter(reader, teamHost, liveAsset)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
