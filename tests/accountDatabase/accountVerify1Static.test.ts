import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Static guards for the R13-VERIFY1 migration; complements the executable local suites 05/06
// and tests/accountVerification/verifierPostgres.integration.ts.
const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261118000002_r13_verify1_trusted_card_admission.sql'),
  'utf8',
)

test('R13-VERIFY1 is forward-only and never redefines earlier objects', () => {
  assert.doesNotMatch(sql, /\bDROP\s+(TABLE|POLICY|SCHEMA|ROLE|FUNCTION)\b/i)
  assert.doesNotMatch(sql, /CREATE (OR REPLACE )?FUNCTION public\./)
  // Only the two NEW private tables may be altered (to enable RLS); earlier tables never are.
  assert.doesNotMatch(sql, /ALTER TABLE public\.account_(participation_profiles|completed_challenges|in_progress_challenges|saved_challenges|saved_scriptures|earned_awards|shelf_months|reconciliation_receipts|reconciliation_unresolved_items|provisional_award_claims)\b/)
  assert.doesNotMatch(sql, /CREATE TABLE public\.account_(participation_profiles|completed_challenges|earned_awards|provisional_award_claims|reconciliation_receipts)\b/)
})

test('R13-VERIFY1 issuance is server-only: never granted to client roles or the TX1 reconciler', () => {
  assert.doesNotMatch(sql, /GRANT[^;]*\bTO\s+[^;]*\b(anon|authenticated|PUBLIC|service_role|account_reconciler)\b/i)
  assert.match(sql, /REVOKE ALL ON ALL FUNCTIONS IN SCHEMA account_issuance FROM PUBLIC, anon, authenticated, account_reconciler;/)
  assert.match(sql, /CREATE ROLE account_award_issuer\s+NOLOGIN[^;]*NOBYPASSRLS/)
  assert.match(sql, /CREATE ROLE account_award_verifier\s+NOLOGIN[^;]*NOBYPASSRLS/)
  for (const fn of ['list_pending_award_claims', 'get_claim_verification_context', 'record_verification_deferral', 'admit_verified_award']) {
    assert.match(sql, new RegExp(`ALTER FUNCTION account_issuance\\.${fn}\\([^)]*\\) OWNER TO account_award_issuer;`))
  }
})

test('R13-VERIFY1 issuer cannot rewrite trusted award date, provenance or Card metadata', () => {
  assert.match(sql, /GRANT UPDATE \(hub_announcement_acked, card_viewed, updated_at\)\s+ON TABLE public\.account_earned_awards TO account_award_issuer;/)
  assert.doesNotMatch(sql, /GRANT[^;]*DELETE[^;]*public\.account_earned_awards/)
  assert.doesNotMatch(sql, /'serverVerified'/, 'admission never mints serverVerified provenance')
  assert.doesNotMatch(sql, /v_claim\.earned_card_snapshot/, 'client snapshot is never admitted')
})

test('R13-VERIFY1 contains no credentials, service keys or remote endpoints', () => {
  assert.doesNotMatch(sql, /service_role_key|SUPABASE_SERVICE|SANITY_READ_TOKEN|eyJ[A-Za-z0-9_-]{10,}|https?:\/\/[a-z0-9.-]*(supabase\.co|api\.sanity\.io)/i)
})
