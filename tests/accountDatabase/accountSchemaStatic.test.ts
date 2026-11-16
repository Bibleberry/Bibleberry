import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20261116000001_r13_3_account_schema_and_rls.sql',
)
const INTEGRATION_SQL_PATH = resolve(
  process.cwd(),
  'tests/accountDatabase/01_r13_3_rls_and_schema_integration.sql',
)

const migrationSql = readFileSync(MIGRATION_PATH, 'utf8')
const integrationSql = readFileSync(INTEGRATION_SQL_PATH, 'utf8')

const REQUIRED_TABLES = [
  'account_participation_profiles',
  'account_completed_challenges',
  'account_in_progress_challenges',
  'account_saved_challenges',
  'account_saved_scriptures',
  'account_earned_awards',
  'account_shelf_months',
  'account_reconciliation_receipts',
] as const

test('R13-3 migration defines all 8 R13-0 tables with auth.users(id) ON DELETE CASCADE and RLS enabled', () => {
  for (const table of REQUIRED_TABLES) {
    assert.match(
      migrationSql,
      new RegExp(`CREATE TABLE public\\.${table}\\b`),
      `Missing CREATE TABLE for ${table}`,
    )
    assert.match(
      migrationSql,
      new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY;`),
      `Missing ENABLE ROW LEVEL SECURITY for ${table}`,
    )
    assert.match(
      migrationSql,
      new RegExp(`CREATE POLICY "${table}_select_own"[\\s\\S]*?FOR SELECT[\\s\\S]*?TO authenticated[\\s\\S]*?USING \\(account_id = auth\\.uid\\(\\)\\);`),
      `Missing owner-scoped SELECT policy for ${table}`,
    )
  }

  const cascadeRefs = migrationSql.match(/REFERENCES auth\.users\(id\) ON DELETE CASCADE/g) ?? []
  assert.equal(
    cascadeRefs.length,
    REQUIRED_TABLES.length,
    'Every private account table must reference auth.users(id) ON DELETE CASCADE',
  )
})

test('R13-3 migration revokes PUBLIC/anon/authenticated write privileges and defines no direct client write policies', () => {
  assert.match(migrationSql, /REVOKE ALL ON TABLE[\s\S]*?FROM PUBLIC, anon, authenticated;/)
  assert.doesNotMatch(migrationSql, /FOR (INSERT|UPDATE|DELETE)\s+TO\s+(anon|authenticated|PUBLIC)/i)
  assert.doesNotMatch(migrationSql, /GRANT\s+(INSERT|UPDATE|DELETE|ALL)\s+ON\s+TABLE[^;]*?\bTO\s+(anon|authenticated|PUBLIC)\b/i)
})

test('R13-3 migration excludes prohibited PII, journaling, streak, and passage manuscript columns', () => {
  const prohibitedColumns = ['passage_text', 'manuscript_text', 'streak_count', 'journal_entry', 'email']
  for (const col of prohibitedColumns) {
    assert.doesNotMatch(
      migrationSql,
      new RegExp(`\\b${col}\\b`, 'i'),
      `Prohibited column/identifier found in migration: ${col}`,
    )
  }
})

test('R13-3 local SQL integration fixture covers all 8 tables and rolls back cleanly', () => {
  for (const table of REQUIRED_TABLES) {
    assert.match(integrationSql, new RegExp(`'${table}'`), `Integration fixture missing ${table}`)
  }
  assert.match(integrationSql, /^BEGIN;/m)
  assert.match(integrationSql, /^ROLLBACK;\s*$/m)
})
