import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Static guards for the R13-TX1 migration. These complement (never replace) the executable
// local PostgreSQL suites in tests/accountDatabase/0[2-4]_r13_tx1_*.
const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20261118000001_r13_tx1_account_reconciliation_transaction.sql',
)
const R13_3_PATH = resolve(process.cwd(), 'supabase/migrations/20261116000001_r13_3_account_schema_and_rls.sql')
const sql = readFileSync(MIGRATION_PATH, 'utf8')

function functionBlock(name: string): string {
  const start = sql.indexOf(`CREATE FUNCTION public.${name}(`)
  assert.notEqual(start, -1, `missing public.${name}`)
  const end = sql.indexOf('\n$$;', start)
  return sql.slice(start, end)
}

test('R13-TX1 is forward-only: never drops or recreates the R13-3 tables', () => {
  assert.doesNotMatch(sql, /\bDROP\s+(TABLE|POLICY|SCHEMA|ROLE)\b/i)
  assert.doesNotMatch(sql, /CREATE TABLE public\.account_(participation_profiles|completed_challenges|in_progress_challenges|saved_challenges|saved_scriptures|earned_awards|shelf_months|reconciliation_receipts)\b/)
  assert.match(readFileSync(R13_3_PATH, 'utf8'), /CREATE TABLE public\.account_participation_profiles/)
})

test('R13-TX1 commit is SECURITY DEFINER with empty search_path, owned by the dedicated role', () => {
  const block = functionBlock('reconcile_guest_participation')
  assert.match(block, /SECURITY DEFINER/)
  assert.match(block, /SET search_path = ''/)
  assert.match(block, /v_uid uuid := auth\.uid\(\);/)
  assert.match(sql, /ALTER FUNCTION public\.reconcile_guest_participation\(jsonb\) OWNER TO account_reconciler;/)
  assert.match(sql, /CREATE ROLE account_reconciler\s+NOLOGIN[^;]*NOBYPASSRLS/)
})

test('R13-TX1 read path is SECURITY INVOKER so RLS applies', () => {
  assert.match(functionBlock('get_account_participation'), /SECURITY INVOKER/)
})

test('R13-TX1 grants EXECUTE only to authenticated and never widens client table writes', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.reconcile_guest_participation\(jsonb\) FROM PUBLIC, anon, authenticated;/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.reconcile_guest_participation\(jsonb\) TO authenticated;/)
  assert.doesNotMatch(sql, /GRANT\s+(INSERT|UPDATE|DELETE|ALL)\b[^;]*\bTO\s+(anon|authenticated|PUBLIC)\b/i)
  assert.doesNotMatch(sql, /FOR (ALL|INSERT|UPDATE|DELETE)\s+TO\s+(anon|authenticated|PUBLIC)\b/i)
  assert.doesNotMatch(sql, /GRANT[^;]*account_reconciler\s+TO\s+(anon|authenticated|service_role|PUBLIC)\b/i)
})

test('R13-TX1 never mints serverVerified provenance and never trusts client account IDs', () => {
  const block = functionBlock('reconcile_guest_participation')
  assert.doesNotMatch(block, /'serverVerified'\s*,\s*v_date/)
  assert.doesNotMatch(block, /\(p_payload\s*->>\s*'accountId'\)::uuid/)
  assert.doesNotMatch(block, /v_envelope\s*->>\s*'accountId'\)::uuid/)
})

test('R13-TX1 contains no credentials, service keys or remote endpoints', () => {
  assert.doesNotMatch(sql, /service_role_key|SUPABASE_SERVICE|eyJ[A-Za-z0-9_-]{10,}|https?:\/\/[a-z0-9.-]*supabase\.co/i)
  assert.doesNotMatch(sql, /\b(passage_text|manuscript_text|streak_count|journal_entry|email)\b/i)
})

test('R13-TX1 transaction never creates earned awards without trusted verification (R08A-0 §6.2)', () => {
  const block = functionBlock('reconcile_guest_participation')
  assert.doesNotMatch(block, /INSERT INTO public\.account_earned_awards/)
  assert.match(block, /INSERT INTO public\.account_provisional_award_claims/)
  assert.doesNotMatch(sql, /GRANT[^;]*\bINSERT\b[^;]*ON TABLE public\.account_earned_awards TO account_reconciler/)
})
