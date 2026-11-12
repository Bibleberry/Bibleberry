import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateScope } from '../../scripts/ci/check-scope.mjs';

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

test('CI scope evaluation: universal files trigger all targets on PR', () => {
  const targets = ['reader', 'studio', 'cms-adapter', 'release-gateway', 'collections-browser'];
  const universalFiles = [
    'package.json',
    'package-lock.json',
    '.github/workflows/ci.yml',
    'scripts/ci/check-scope.mjs',
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

test('CI scope evaluation: docs-only PR skips all test suites', () => {
  const docsFiles = [
    'docs/testing/r16-ci-cost-efficiency.md',
    'README.md',
    'info.md',
    'INTERACTIVE_CHALLENGE_LAB_HANDOFF.md',
    '.gitignore',
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

test('CI scope evaluation: Reader UI change skips Studio', () => {
  const readerFiles = ['src/components/Reader.tsx', 'src/screens/MonthScreen.tsx'];

  const readerResult = evaluateScope('reader', readerFiles, 'pull_request');
  assert.equal(readerResult.shouldRun, true);

  const collectionsResult = evaluateScope('collections-browser', readerFiles, 'pull_request');
  assert.equal(collectionsResult.shouldRun, true);

  const studioResult = evaluateScope('studio', readerFiles, 'pull_request');
  assert.equal(studioResult.shouldRun, false, 'Studio should not run on pure reader UI changes');
});

test('CI scope evaluation: Collections spec change triggers collections-browser only', () => {
  const collectionFiles = ['tests/notebook/field-notebook.spec.ts'];

  const collectionsResult = evaluateScope('collections-browser', collectionFiles, 'pull_request');
  assert.equal(collectionsResult.shouldRun, true);

  const studioResult = evaluateScope('studio', collectionFiles, 'pull_request');
  assert.equal(studioResult.shouldRun, false);

  const gatewayResult = evaluateScope('release-gateway', collectionFiles, 'pull_request');
  assert.equal(gatewayResult.shouldRun, false);
});

test('CI scope evaluation: Gateway change triggers release-gateway but not studio', () => {
  const gatewayFiles = ['src/gateway/catalogProvider.ts', 'tests/gateway/catalog.test.ts'];

  const gatewayResult = evaluateScope('release-gateway', gatewayFiles, 'pull_request');
  assert.equal(gatewayResult.shouldRun, true);

  const studioResult = evaluateScope('studio', gatewayFiles, 'pull_request');
  assert.equal(studioResult.shouldRun, false);
});

test('CI scope evaluation: Native-only files skip web/studio CI suites', () => {
  const nativeFiles = ['ios/App/App/AppDelegate.swift', 'android/app/build.gradle'];

  const readerResult = evaluateScope('reader', nativeFiles, 'pull_request');
  assert.equal(readerResult.shouldRun, false);

  const studioResult = evaluateScope('studio', nativeFiles, 'pull_request');
  assert.equal(studioResult.shouldRun, false);

  const collectionsResult = evaluateScope('collections-browser', nativeFiles, 'pull_request');
  assert.equal(collectionsResult.shouldRun, false);
});

test('CI scope evaluation: safe fallbacks for edge cases', () => {
  // Undefined changed files
  assert.equal(evaluateScope('reader', null, 'pull_request').shouldRun, true);
  assert.equal(evaluateScope('reader', undefined, 'pull_request').shouldRun, true);

  // Unknown target
  assert.equal(evaluateScope('nonexistent-target', ['src/foo.ts'], 'pull_request').shouldRun, true);

  // Empty changed files list (diff clean)
  assert.equal(evaluateScope('reader', [], 'pull_request').shouldRun, false);
});
