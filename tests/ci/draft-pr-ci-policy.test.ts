import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { evaluateScope } from '../../scripts/ci/check-scope.mjs';

const prVerificationWorkflows = [
  '.github/workflows/ci.yml',
  '.github/workflows/collections-browser.yml',
  '.github/workflows/native-android.yml',
] as const;

const allPrCiWorkflows = [
  ...prVerificationWorkflows,
  '.github/workflows/native-ios.yml',
] as const;

function readRepoFile(relativePath: string): string {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

function extractBlock(content: string, headerPattern: RegExp): string {
  const lines = content.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => headerPattern.test(line));
  assert.notEqual(startIndex, -1, `Expected to find block matching ${headerPattern}`);

  const headerIndent = lines[startIndex].match(/^(\s*)/)?.[1].length ?? 0;
  const collected = [lines[startIndex]];

  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') {
      collected.push(line);
      continue;
    }
    const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
    if (indent <= headerIndent) {
      break;
    }
    collected.push(line);
  }

  return collected.join('\n');
}

test('Hosted PR verification workflows have no Draft-PR job suppression guards', () => {
  for (const file of allPrCiWorkflows) {
    const workflow = readRepoFile(file);
    assert.doesNotMatch(
      workflow,
      /github\.event\.pull_request\.draft|\bpull_request\.draft\b/,
      `${file} must not suppress jobs based on Draft PR status`,
    );
  }
});

test('PR verification workflows rerun on opened, reopened, synchronize, and ready_for_review without converted_to_draft churn', () => {
  for (const file of prVerificationWorkflows) {
    const workflow = readRepoFile(file);
    const prBlock = extractBlock(workflow, /^ {2}pull_request:\s*$/);
    assert.match(
      prBlock,
      /^ {4}types: \[opened, reopened, synchronize, ready_for_review\]\s*$/m,
      `${file} must trigger on opened, reopened, synchronize, and ready_for_review`,
    );
    assert.doesNotMatch(
      prBlock,
      /converted_to_draft/,
      `${file} must not trigger redundant reruns on converted_to_draft`,
    );
    assert.match(
      prBlock,
      /^ {4}branches: \[main\]\s*$/m,
      `${file} must target main on pull_request`,
    );
  }
});

test('iOS verifies Draft and Ready PRs by commit without a redundant promotion run', () => {
  const workflow = readRepoFile('.github/workflows/native-ios.yml');
  const prBlock = extractBlock(workflow, /^ {2}pull_request:\s*$/);

  assert.match(prBlock, /^ {4}types: \[opened, reopened, synchronize\]\s*$/m);
  assert.match(prBlock, /^ {4}branches: \[main\]\s*$/m);
  assert.doesNotMatch(prBlock, /paths(?:-ignore)?:/);
});

test('Required and named PR verification jobs remain intact with standard hosted runners', () => {
  const expectedJobs: Array<{ file: string; jobId: string; jobName: string }> = [
    { file: '.github/workflows/ci.yml', jobId: 'reader-app', jobName: 'Build reader application' },
    { file: '.github/workflows/ci.yml', jobId: 'cms-adapter-tests', jobName: 'Verify CMS adapters and BerryMark preview' },
    { file: '.github/workflows/ci.yml', jobId: 'release-gateway-tests', jobName: 'Verify Release Gateway core' },
    { file: '.github/workflows/ci.yml', jobId: 'sanity-studio', jobName: 'Verify Sanity Studio' },
    { file: '.github/workflows/collections-browser.yml', jobId: 'browser-collections', jobName: 'Saved Scripture and Field Notebook (Chromium)' },
    { file: '.github/workflows/native-android.yml', jobId: 'android-debug-apk', jobName: 'Native Android debug APK' },
  ];

  for (const { file, jobId, jobName } of expectedJobs) {
    const workflow = readRepoFile(file);
    const jobBlock = extractBlock(workflow, new RegExp(`^ {2}${jobId}:\\s*$`));
    assert.match(
      jobBlock,
      new RegExp(`^ {4}name: ${jobName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm'),
      `${file} job "${jobId}" must preserve name "${jobName}"`,
    );
    assert.match(
      jobBlock,
      /^ {4}runs-on: ubuntu-24\.04\s*$/m,
      `${file} job "${jobId}" must run on standard hosted ubuntu-24.04`,
    );
    assert.doesNotMatch(
      jobBlock,
      /^ {4}if:/m,
      `${file} job "${jobId}" must not gate execution with a job-level Draft condition`,
    );
  }
});

test('Native Android preserves existing PR path filtering while merge_group remains unfiltered', () => {
  const workflow = readRepoFile('.github/workflows/native-android.yml');
  const prBlock = extractBlock(workflow, /^ {2}pull_request:\s*$/);
  const mergeGroupBlock = extractBlock(workflow, /^ {2}merge_group:\s*$/);

  for (const expectedPath of [
    'android/**',
    'capacitor.config.ts',
    'package.json',
    'package-lock.json',
    'src/**',
    'public/**',
    'index.html',
    'vite.config.*',
    '.github/workflows/native-android.yml',
  ]) {
    assert.ok(
      prBlock.includes(`- ${expectedPath}`),
      `native-android.yml pull_request paths must retain ${expectedPath}`,
    );
  }

  assert.match(
    mergeGroupBlock,
    /^ {4}types: \[checks_requested\]\s*\n {4}branches: \[main\]\s*$/m,
    'native-android.yml merge_group must subscribe to checks_requested on main',
  );
  assert.doesNotMatch(
    mergeGroupBlock,
    /paths:/,
    'native-android.yml merge_group must never filter by paths',
  );
});

test('PR verification workflows preserve read-only permissions, SHA-pinned actions, checkout hygiene, and no secrets/pull_request_target', () => {
  for (const file of allPrCiWorkflows) {
    const workflow = readRepoFile(file);

    assert.match(
      workflow,
      /^permissions:\s*\n {2}contents: read\s*$/m,
      `${file} must enforce top-level read-only contents permission`,
    );
    assert.doesNotMatch(workflow, /pull_request_target/, `${file} must never use pull_request_target`);
    assert.doesNotMatch(workflow, /\bsecrets\./, `${file} must not expose secrets to PR code`);
    assert.doesNotMatch(workflow, /self-hosted/, `${file} must not target self-hosted runners`);
    assert.doesNotMatch(workflow, /:\s*write\b/, `${file} must not request write token scopes`);

    const usesLines = [...workflow.matchAll(/uses:\s*([^\s#]+)/g)].map((match) => match[1]);
    assert.ok(usesLines.length > 0, `${file} must declare pinned external actions`);
    for (const actionRef of usesLines) {
      assert.match(
        actionRef,
        /^[^@]+@[0-9a-f]{40}$/,
        `${file} action "${actionRef}" must be pinned to a full 40-character commit SHA`,
      );
    }

    const checkoutBlocks = [...workflow.matchAll(/uses:\s*actions\/checkout@[0-9a-f]{40}[\s\S]*?(?=\n {6}- |\n {2}\S|$)/g)];
    assert.ok(checkoutBlocks.length > 0, `${file} must check out the repository`);
    for (const [block] of checkoutBlocks) {
      assert.match(
        block,
        /persist-credentials:\s*false/,
        `${file} checkout step must disable persisted git credentials`,
      );
    }
  }
});

test('Change-scope skip logs explicitly distinguish irrelevant files from Draft PR suppression', () => {
  const scopedJobs: Array<{ file: string; jobId: string; target: string }> = [
    { file: '.github/workflows/ci.yml', jobId: 'reader-app', target: 'reader' },
    { file: '.github/workflows/ci.yml', jobId: 'cms-adapter-tests', target: 'cms-adapter' },
    { file: '.github/workflows/ci.yml', jobId: 'release-gateway-tests', target: 'release-gateway' },
    { file: '.github/workflows/ci.yml', jobId: 'sanity-studio', target: 'studio' },
    { file: '.github/workflows/collections-browser.yml', jobId: 'browser-collections', target: 'collections-browser' },
  ];

  for (const { file, jobId, target } of scopedJobs) {
    const workflow = readRepoFile(file);
    const jobBlock = extractBlock(workflow, new RegExp(`^ {2}${jobId}:\\s*$`));

    assert.match(
      jobBlock,
      new RegExp(`node scripts/ci/check-scope\\.mjs --target ${target}\\b`),
      `${file} job "${jobId}" must evaluate change scope for target "${target}"`,
    );
    assert.match(
      jobBlock,
      /if:\s*steps\.scope\.outputs\.should_run != 'true'\s*\n\s*run:\s*\|\s*\n\s*echo "Change-scope skip \(irrelevant files; not Draft PR suppression\):/,
      `${file} job "${jobId}" skip log must clearly identify change-scope (irrelevant files) rather than Draft suppression`,
    );
  }
});

test('Scope detector skips docs-only Draft PRs for irrelevant files and runs reader/collections for reader edits', () => {
  const docsOnlyTargets = ['reader', 'cms-adapter', 'release-gateway', 'studio', 'collections-browser'] as const;
  for (const target of docsOnlyTargets) {
    const result = evaluateScope(target, ['docs/testing/draft-pr-hosted-ci.md'], 'pull_request');
    assert.equal(result.shouldRun, false, `Docs-only PR should skip ${target}`);
    assert.match(result.reason, /No files matching target/);
    assert.doesNotMatch(result.reason, /draft/i);
  }

  for (const readerFile of ['src/App.tsx', 'tests/smoke/navigation.spec.ts']) {
    const reader = evaluateScope('reader', [readerFile], 'pull_request');
    assert.equal(reader.shouldRun, true, `${readerFile} must run reader verification`);
    const studio = evaluateScope('studio', [readerFile], 'pull_request');
    assert.equal(studio.shouldRun, false, `${readerFile} should still fast-skip studio`);
  }

  const collectionsSource = evaluateScope('collections-browser', ['src/App.tsx'], 'pull_request');
  assert.equal(collectionsSource.shouldRun, true, 'Reader source edit must trigger collections-browser');

  const scriptPath = fileURLToPath(new URL('../../scripts/ci/check-scope.mjs', import.meta.url));
  const docsCliOutput = execFileSync(
    process.execPath,
    [scriptPath, '--target', 'reader', '--event', 'pull_request', '--files', 'docs/testing/draft-pr-hosted-ci.md'],
    { encoding: 'utf8' },
  );
  assert.match(docsCliOutput, /\[ci-scope\] Result: should_run=false/);
  assert.match(docsCliOutput, /\[ci-scope\] Reason: No files matching target "reader" were modified/);
});
