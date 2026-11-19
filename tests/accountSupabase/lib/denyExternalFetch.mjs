// R13-VERIFY2 (test-only preload): a verifier CLI child process started by the local Supabase
// acceptance suite must never reach a real network service (no real Sanity request). Any
// fetch() is refused before a socket opens; the CLI's accepted provider maps that to
// `unavailable`. Loaded with `node --import`.
globalThis.fetch = async () => {
  throw new Error('denied by tests/accountSupabase/lib/denyExternalFetch.mjs')
}
