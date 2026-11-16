import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateScope,
  getConcurrencyGroup,
  shouldCancelInProgress,
  getChangedFilesFromGit,
} from '../../scripts/ci/check-scope.mjs';

test('CI scope evaluation: push event always triggers full verification', () => {
  const targets = ['reader', 'studio', 'cms-adapter', 'release-gateway', 'collections-browser'];
  for (const target of targets) {
    const result = evaluateScope(target, ['docs/readme.md'], 'push');
    assert.equal(result.shouldRun, true);
    assert.match(result.reason, /main branch/);
  }
});

test('CI scope evaluation: workflow_dispatch event always triggers full execution', () => {
  const result = evaluateScope('reader', ['docs/any.md'], 'workflow_dispatch');
  assert.equal(result.shouldRun, true);
});

test('CI scope evaluation: universal manifests, lint configs, and workflow definitions trigger all targets', () => {
  const targets = ['reader', 'studio', 'cms-adapter', 'release-gateway', 'collections-browser'];
  const universalFiles = [
    'package.json',
    'package-lock.json',
    'eslint.config.js',
    '.github/workflows/ci.yml',
    '.github/workflows/collections-browser.yml',
    'scripts/ci/check-scope.mjs',
    'tests/ci/check-scope.test.ts',
  ];

  for (const file of universalFiles) {
    for (const target of targets) {
      const result = evaluateScope(target, [file], 'pull_request');
      assert.equal(
        result.shouldRun,
        true,
        `Expected ${target} to run when ${file} is modified`
      );
      assert.match(result.reason, /Universal dependency or configuration/);
    }
  }
});

test('CI scope evaluation: root tooling and configuration files trigger reader verification', () => {
  const rootConfigs = [
    'vite.config.ts',
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.node.json',
    'tailwind.config.js',
    'postcss.config.js',
    'components.json',
    'capacitor.config.ts',
    'wrangler.jsonc',
    'wrangler.staging.jsonc',
    'playwright.config.ts',
  ];

  for (const config of rootConfigs) {
    const result = evaluateScope('reader', [config], 'pull_request');
    assert.equal(
      result.shouldRun,
      true,
      `Expected reader to trigger on root config change: ${config}`
    );
  }
});

test('CI scope evaluation: test-only changes trigger relevant verification and never bypass reader lint/typecheck', () => {
  const testFiles = [
    'tests/cardViewer/earned-scripture-card-viewer.spec.ts',
    'tests/cardViewer/harness/main.tsx',
    'tests/monthAccessibility/month-screen-accessibility.spec.ts',
    'tests/announcements/hub-card-announcements.spec.ts',
    'tests/performance/compare-r21-baselines.ts',
    'tests/smoke/navigation.spec.ts',
    'tests/savedScripture/saved-scripture-collection.spec.ts',
    'tests/notebook/field-notebook.spec.ts',
    'tests/futureSuite/sample.test.ts', // Any future or newly added test directory
  ];

  for (const testFile of testFiles) {
    const readerResult = evaluateScope('reader', [testFile], 'pull_request');
    assert.equal(
      readerResult.shouldRun,
      true,
      `Expected reader verification (lint & build) to run for test file: ${testFile}`
    );

    // Studio must not run on reader-only test changes
    const studioResult = evaluateScope('studio', [testFile], 'pull_request');
    assert.equal(
      studioResult.shouldRun,
      false,
      `Expected Studio to be skipped for reader test file: ${testFile}`
    );
  }
});

test('CI scope evaluation: subsystem-specific test directories trigger corresponding test jobs', () => {
  // CMS Adapter suites
  const sanityResult = evaluateScope('cms-adapter', ['tests/sanity/adapter.test.ts'], 'pull_request');
  assert.equal(sanityResult.shouldRun, true);

  const partResult = evaluateScope('cms-adapter', ['tests/participation/driver.test.ts'], 'pull_request');
  assert.equal(partResult.shouldRun, true);

  const perfResult = evaluateScope('cms-adapter', ['tests/performance/baseline.test.ts'], 'pull_request');
  assert.equal(perfResult.shouldRun, true);

  // Gateway suite
  const gatewayResult = evaluateScope('release-gateway', ['tests/gateway/catalog.test.ts'], 'pull_request');
  assert.equal(gatewayResult.shouldRun, true);

  // Collections suites
  const cardViewerCollectionsResult = evaluateScope(
    'collections-browser',
    ['tests/cardViewer/earned-scripture-card-viewer.spec.ts'],
    'pull_request'
  );
  assert.equal(cardViewerCollectionsResult.shouldRun, true);

  const announcementsCollectionsResult = evaluateScope(
    'collections-browser',
    ['tests/announcements/hub-card-announcements.spec.ts'],
    'pull_request'
  );
  assert.equal(announcementsCollectionsResult.shouldRun, true);
});

test('CI scope evaluation: docs-only PR skips all test suites', () => {
  const docsFiles = [
    'docs/testing/r16-ci-cost-efficiency.md',
    'README.md',
    'info.md',
    'INTERACTIVE_CHALLENGE_LAB_HANDOFF.md',
    '.gitignore',
    '.gitattributes',
  ];
  const targets = ['reader', 'studio', 'cms-adapter', 'release-gateway', 'collections-browser'];

  for (const target of targets) {
    const result = evaluateScope(target, docsFiles, 'pull_request');
    assert.equal(
      result.shouldRun,
      false,
      `Expected ${target} to be skipped on docs-only change`
    );
    assert.match(result.reason, /No files matching target/);
  }
});

test('CI scope evaluation: Studio-only PR runs studio but skips reader and collections', () => {
  const studioFiles = ['studio/schemaTypes/challenge.ts', 'studio/tests/schema.test.ts'];

  const studioResult = evaluateScope('studio', studioFiles, 'pull_request');
  assert.equal(studioResult.shouldRun, true);

  const readerResult = evaluateScope('reader', studioFiles, 'pull_request');
  assert.equal(readerResult.shouldRun, false);

  const collectionsResult = evaluateScope('collections-browser', studioFiles, 'pull_request');
  assert.equal(collectionsResult.shouldRun, false);

  const adapterResult = evaluateScope('cms-adapter', studioFiles, 'pull_request');
  assert.equal(adapterResult.shouldRun, false);
});

test('CI scope evaluation: Studio fixtures in src/gateway/fixtures run both studio and gateway', () => {
  const fixtureFiles = ['src/gateway/fixtures/r08aMonthlyFixtures.ts'];

  const studioResult = evaluateScope('studio', fixtureFiles, 'pull_request');
  assert.equal(studioResult.shouldRun, true, 'Studio must run when shared fixtures change');

  const gatewayResult = evaluateScope('release-gateway', fixtureFiles, 'pull_request');
  assert.equal(gatewayResult.shouldRun, true, 'Release gateway must run when fixtures change');

  const readerResult = evaluateScope('reader', fixtureFiles, 'pull_request');
  assert.equal(readerResult.shouldRun, true, 'Reader must run when src/ changes');
});

test('CI scope evaluation: Reader UI change triggers reader and collections but skips Studio', () => {
  const readerFiles = ['src/components/Reader.tsx', 'src/screens/MonthScreen.tsx'];

  const readerResult = evaluateScope('reader', readerFiles, 'pull_request');
  assert.equal(readerResult.shouldRun, true);

  const collectionsResult = evaluateScope('collections-browser', readerFiles, 'pull_request');
  assert.equal(collectionsResult.shouldRun, true);

  const studioResult = evaluateScope('studio', readerFiles, 'pull_request');
  assert.equal(studioResult.shouldRun, false, 'Studio should not run on pure reader UI changes');
});

test('CI scope evaluation: safe fallbacks for edge cases and undetermined scope', () => {
  // Undefined or null changed files must fail open to execution
  assert.equal(evaluateScope('reader', null, 'pull_request').shouldRun, true);
  assert.equal(evaluateScope('reader', undefined, 'pull_request').shouldRun, true);

  // Unknown target must fail open to execution
  assert.equal(evaluateScope('nonexistent-target', ['src/foo.ts'], 'pull_request').shouldRun, true);

  // Empty changed files list (diff clean, 0 files modified)
  assert.equal(evaluateScope('reader', [], 'pull_request').shouldRun, false);
});

test('Git diff safety: invalid or missing baseRef returns null without single-commit guessing', () => {
  // When baseRef is nonexistent, getChangedFilesFromGit must return null (not fall back to HEAD~1)
  const result = getChangedFilesFromGit('nonexistent-branch-name-123456');
  assert.equal(result, null);
});

test('Workflow concurrency: sibling PRs are independent while pushes to same PR cancel in-progress', () => {
  const group148 = getConcurrencyGroup('Bibleberry CI', 148, 'refs/pull/148/merge');
  const group149 = getConcurrencyGroup('Bibleberry CI', 149, 'refs/pull/149/merge');
  const mainGroup = getConcurrencyGroup('Bibleberry CI', undefined, 'refs/heads/main');

  // Sibling PRs have distinct concurrency groups
  assert.equal(group148, 'Bibleberry CI-148');
  assert.equal(group149, 'Bibleberry CI-149');
  assert.notEqual(group148, group149);

  // Main branch group uses git ref
  assert.equal(mainGroup, 'Bibleberry CI-refs/heads/main');

  // In-progress runs on PRs are canceled when new commits arrive
  assert.equal(shouldCancelInProgress('pull_request'), true);

  // Main branch and manual runs never cancel in-progress executions
  assert.equal(shouldCancelInProgress('push'), false);
  assert.equal(shouldCancelInProgress('workflow_dispatch'), false);
});


test('Merge queue scope: always verify the complete integrated SHA, even for docs-only or empty diffs', () => {
  const targets = ['reader', 'studio', 'cms-adapter', 'release-gateway', 'collections-browser'];
  for (const target of targets) {
    for (const changedFiles of [[], ['docs/readme.md'], null, undefined]) {
      const result = evaluateScope(target, changedFiles, 'merge_group');
      assert.equal(result.shouldRun, true, `${target} must always run for a merge_group event`);
      assert.match(result.reason, /Merge queue integration commits/);
    }
  }
});

test('Merge queue runs are never canceled as if they were superseded PR builds', () => {
  assert.equal(shouldCancelInProgress('merge_group'), false);
  const queueA = getConcurrencyGroup('Bibleberry CI', undefined, 'refs/heads/gh-readonly-queue/main/pr-184');
  const queueB = getConcurrencyGroup('Bibleberry CI', undefined, 'refs/heads/gh-readonly-queue/main/pr-180');
  assert.notEqual(queueA, queueB);
});
