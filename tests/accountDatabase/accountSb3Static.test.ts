import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Static guards for the R13-SB3 (Granite Sparrow, Issue #236) migration. The executable proof is
// the real-local-Supabase runner (suites U and E, tests/accountSupabase/sb3ServiceRoleChecks.sql);
// these guards keep the migration narrow and forward-only.
const MIGRATIONS = resolve(process.cwd(), 'supabase/migrations')
const SB3_FILE = '20261119000001_r13_sb3_service_role_award_grant_remediation.sql'
const sql = readFileSync(resolve(MIGRATIONS, SB3_FILE), 'utf8')
const code = sql.replace(/--[^\n]*/g, '')

test('R13-SB3 is the newest migration and the accepted history is unchanged in order', () => {
  assert.deepEqual(readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort(), [
    '20261116000001_r13_3_account_schema_and_rls.sql',
    '20261118000001_r13_tx1_account_reconciliation_transaction.sql',
    '20261118000002_r13_verify1_trusted_card_admission.sql',
    SB3_FILE,
  ])
})

test('R13-SB3 only narrows privileges: no GRANT, no object definition, no data change', () => {
  assert.doesNotMatch(code, /\bGRANT\b/i, 'nothing is granted to anyone')
  assert.doesNotMatch(code, /\b(CREATE|DROP|ALTER)\s+(TABLE|POLICY|SCHEMA|ROLE|FUNCTION|TRIGGER|VIEW|DEFAULT)\b/i)
  assert.doesNotMatch(code, /\bALTER\s+(TABLE|ROLE|DEFAULT\s+PRIVILEGES)\b/i)
  assert.doesNotMatch(code, /\b(INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM|TRUNCATE\s+public\.)/i, 'no row is written or removed')
  assert.doesNotMatch(code, /\bSECURITY DEFINER\b|\bBYPASSRLS\b|\bDISABLE ROW LEVEL SECURITY\b/i)
  // Every REVOKE targets service_role only: dedicated and client roles are untouched.
  const revokes = code.match(/\bREVOKE\b[^;]*;/gi) ?? []
  assert.equal(revokes.length, 3)
  for (const revoke of revokes) assert.match(revoke, /\bFROM service_role;$/, revoke)
})

test('R13-SB3 removes every service_role write path into award and admission-evidence tables', () => {
  const evidence = code.match(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE([^;]*)FROM service_role;/)
  assert.ok(evidence, 'award/evidence REVOKE present')
  for (const t of ['account_earned_awards', 'account_completed_challenges', 'account_provisional_award_claims',
    'account_reconciliation_receipts', 'account_reconciliation_unresolved_items']) {
    assert.match(evidence![1], new RegExp(`public\\.${t}\\b`), t)
  }
  assert.match(code, /REVOKE ALL ON TABLE\s+public\.account_award_admission_attestations,\s+public\.account_award_verification_attempts\s+FROM service_role;/)
  assert.match(code, /REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE[^;]*public\.account_participation_profiles[^;]*FROM service_role;/)
})

test('R13-SB3 asserts EFFECTIVE privileges inside the migration (fails and rolls back on regression)', () => {
  assert.match(code, /has_table_privilege\('service_role'/)
  assert.match(code, /has_any_column_privilege\('service_role'/)
  assert.match(code, /pg_has_role\('service_role', r, 'MEMBER'\)/)
  assert.match(code, /RAISE EXCEPTION 'R13-SB3: service_role still holds award\/evidence write privileges/)
  assert.match(code, /RAISE EXCEPTION 'R13-SB3: accepted reconciler\/issuer authority changed unexpectedly'/)
  assert.match(code, /^BEGIN;[\s\S]*COMMIT;\s*$/m)
})

test('R13-SB3 contains no credentials, keys or remote endpoints', () => {
  assert.doesNotMatch(sql, /service_role_key|SUPABASE_SERVICE|sb_secret_|eyJ[A-Za-z0-9_-]{10,}|https?:\/\//i)
})

test('earlier migrations are not edited by R13-SB3 (their service_role ALL grant text is still the accepted text)', () => {
  const r133 = readFileSync(resolve(MIGRATIONS, '20261116000001_r13_3_account_schema_and_rls.sql'), 'utf8')
  assert.match(r133, /GRANT ALL ON TABLE[\s\S]*public\.account_earned_awards[\s\S]*TO service_role;/)
})
