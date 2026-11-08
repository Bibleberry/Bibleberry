import { handleGatewayRequest } from './handler.ts'
import type { GatewayOptions, WorkerEnv } from './types.ts'

/**
 * Handles incoming Cloudflare Worker requests.
 *
 * Directs API requests (`/api/*`) to the release gateway handler.
 * For non-API requests (such as static assets and SPA navigation), delegates
 * to Cloudflare Workers Static Assets binding (`env.ASSETS`) if configured.
 * If no asset binding is provided (e.g. standalone gateway), delegates to
 * `handleGatewayRequest()`, returning the gateway's standard 404 response.
 */
export async function handleWorkerRequest(
  request: Request,
  env: WorkerEnv,
  options?: GatewayOptions,
): Promise<Response> {
  let url: URL
  try {
    url = new URL(request.url)
  } catch {
    return handleGatewayRequest(request, env, options)
  }

  // Intercept /api/* routes for the secure release gateway
  if (url.pathname.startsWith('/api/') || url.pathname === '/api') {
    return handleGatewayRequest(request, env, options)
  }

  // Delegate non-API requests to static assets if asset binding is available
  if (env.ASSETS) {
    return env.ASSETS.fetch(request)
  }

  // Non-API routes without asset binding fall through to gateway 404
  return handleGatewayRequest(request, env, options)
}

export default {
  async fetch(
    request: Request,
    env: WorkerEnv,
  ): Promise<Response> {
    return handleWorkerRequest(request, env)
  },
}
