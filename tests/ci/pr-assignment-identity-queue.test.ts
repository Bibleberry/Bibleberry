import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const workflow = readFileSync(
  new URL('../../.github/workflows/pr-assignment-identity.yml', import.meta.url),
  'utf8',
)
const goodSha = 'a'.repeat(40)
const baseSha = 'b'.repeat(40)

function queueScript(): string {
  const marker = '      - name: Verify trusted merge-group context\n'
  assert.equal(workflow.split(marker).length, 2, 'Expected exactly one merge-group verification step')
  const step = workflow.split(marker)[1]
  const script = step.split('        run: |\n')[1]
  assert.ok(script, 'Merge-group verification must have a bash script')
  return script.split('\n').filter(line => line.trim() !== '').map(line => {
    assert.match(line, /^ {10}/, 'Expected workflow bash body indented by ten spaces')
    return line.slice(10)
  }).join('\n')
}

test('identity check keeps its trusted PR validation and adds main merge_group events', () => {
  assert.match(workflow, /^on:\n {2}pull_request_target:\n {4}types: \[opened, reopened, edited, synchronize, ready_for_review\]\n {4}branches: \[main\]/m)
  assert.match(workflow, /^ {2}merge_group:\n {4}types: \[checks_requested\]\n {4}branches: \[main\]/m)
  assert.equal((workflow.match(/^ {4}name: Verify PR codename and originating Issue$/gm) ?? []).length, 1)
  assert.match(workflow, /name: Validate human-directed PR assignment identity\n.*\n {8}if: github.event_name == 'pull_request_target'/)
  assert.match(workflow, /name: Verify trusted merge-group context\n[\s\S]*?if: github.event_name == 'merge_group'/)
  assert.match(workflow, /PR_TITLE: .+github\.event\.pull_request\.title/)
  assert.match(workflow, /PR_BODY: .+github\.event\.pull_request\.body/)
  assert.match(workflow, /QUEUE_HEAD_SHA: .+github\.event\.merge_group\.head_sha/)
  assert.match(workflow, /QUEUE_BASE_SHA: .+github\.event\.merge_group\.base_sha/)
  assert.match(workflow, /QUEUE_BASE_REF: .+github\.event\.merge_group\.base_ref/)
})

test('identity check preserves least-privilege trusted-workflow boundaries', () => {
  assert.match(workflow, /^permissions:\n {2}contents: read\n {2}issues: read$/m)
  assert.doesNotMatch(workflow, /\bcontents: write\b|\bissues: write\b/)
  assert.doesNotMatch(workflow, /uses: actions\/checkout|secrets\.|git checkout|eval\(/)
  assert.match(workflow, /if number < 296:/)
  assert.match(workflow, /exempt_bots = \{"dependabot\[bot\]", "renovate\[bot\]"\}/)
  assert.match(workflow, /if len\(distinct\) != 1:/)
  assert.match(workflow, /issue\.get\("title", ""\)\.startswith\(expected\)/)
})

test('merge-group context fails closed for missing, malformed or wrong-base metadata', () => {
  const script = queueScript()
  const base = { QUEUE_HEAD_SHA: goodSha, QUEUE_BASE_SHA: baseSha, QUEUE_BASE_REF: 'refs/heads/main' }
  const cases = [
    { overrides: {}, success: true },
    { overrides: { QUEUE_HEAD_SHA: '' }, success: false },
    { overrides: { QUEUE_HEAD_SHA: 'invalid' }, success: false },
    { overrides: { QUEUE_BASE_SHA: '' }, success: false },
    { overrides: { QUEUE_BASE_SHA: 'invalid' }, success: false },
    { overrides: { QUEUE_BASE_REF: 'refs/heads/other' }, success: false },
    { overrides: { QUEUE_BASE_REF: '' }, success: false },
  ]
  for (const { overrides, success } of cases) {
    const result = spawnSync('bash', ['-e', '-c', script], {
      env: { ...process.env, ...base, ...overrides },
      encoding: 'utf8',
    })
    assert.equal(result.status, success ? 0 : 1,
      JSON.stringify({ overrides, stderr: result.stderr, stdout: result.stdout }))
    if (success) assert.match(result.stdout, /per-PR metadata must be enforced/)
  }
})
