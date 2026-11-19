import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const requiredWorkflows = [
  '.github/workflows/ci.yml',
  '.github/workflows/collections-browser.yml',
  '.github/workflows/native-android.yml',
];

function readRepoFile(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

test('Integration workflows subscribe to merge_group checks_requested on main', () => {
  for (const file of requiredWorkflows) {
    const workflow = readRepoFile(file);
    assert.match(workflow, /^on:\s*$/m, `${file} must declare event triggers`);
    assert.match(
      workflow,
      /^ {2}merge_group:\s*\n {4}types: \[checks_requested\]\s*\n {4}branches: \[main\]/m,
      `${file} must run when GitHub requests merge-group checks against main`,
    );
  }
});

test('Merge-group CI preserves the existing branch-protection required job names', () => {
  const workflow = readRepoFile('.github/workflows/ci.yml');
  assert.match(workflow, /^ {4}name: Build reader application\s*$/m);
  assert.match(workflow, /^ {4}name: Verify Sanity Studio\s*$/m);
});

test('Merge-group queue builds must not be canceled as ordinary PR synchronizations', () => {
  for (const file of requiredWorkflows) {
    const workflow = readRepoFile(file);
    assert.match(
      workflow,
      /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/,
      `${file} must not cancel merge_group builds when PRs change`,
    );
    assert.match(
      workflow,
      /github\.event\.pull_request\.number \|\| github\.ref/,
      `${file} must isolate queue refs from pull-request concurrency groups`,
    );
  }
});

test('Integration workflows run on Draft PRs without skipping merge-group validation', () => {
  for (const file of requiredWorkflows) {
    const workflow = readRepoFile(file);
    assert.doesNotMatch(
      workflow,
      /pull_request\.draft/,
      `${file} must not suppress hosted CI jobs solely because a PR is Draft`,
    );
  }
});
