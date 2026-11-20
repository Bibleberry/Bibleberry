import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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

test('Diagnostic iOS runner comparison workflow is strictly workflow_dispatch-only and cannot become a second PR or merge_group check', () => {
  const workflow = readRepoFile('.github/workflows/native-ios-runner-comparison.yml');
  const onBlock = extractBlock(workflow, /^on:\s*$/);

  assert.match(onBlock, /^ {2}workflow_dispatch:\s*$/m);
  assert.doesNotMatch(onBlock, /^ {2}pull_request:/m);
  assert.doesNotMatch(onBlock, /^ {2}pull_request_target:/m);
  assert.doesNotMatch(onBlock, /^ {2}push:/m);
  assert.doesNotMatch(onBlock, /^ {2}merge_group:/m);
  assert.doesNotMatch(onBlock, /^ {2}schedule:/m);

  // Must not reuse the production job name or overwrite production artifact names.
  assert.doesNotMatch(workflow, /Signing-free iOS Simulator build/);
  assert.doesNotMatch(workflow, /bibleberry-r20-4-ios-simulator-evidence/);
  assert.doesNotMatch(workflow, /bibleberry-r20-3-ios-simulator-app/);

  // Restricts dispatch options strictly to standard GitHub-hosted macOS 26 runners.
  assert.match(onBlock, /- macos-26-intel\b/);
  assert.match(onBlock, /- macos-26\b/);
  assert.doesNotMatch(workflow, /macos-26-large|macos-26-xlarge|macos-latest-large|self-hosted/);
});

test('Diagnostic iOS runner comparison preserves read-only security posture, SHA-pinned actions, and full strict simulator acceptance', () => {
  const workflow = readRepoFile('.github/workflows/native-ios-runner-comparison.yml');

  assert.match(workflow, /^permissions:\s*\n {2}contents: read\s*$/m);
  assert.doesNotMatch(workflow, /:\s*write\b|\bsecrets\.|pull_request_target|continue-on-error/);

  const usesLines = [...workflow.matchAll(/uses:\s*([^\s#]+)/g)].map((match) => match[1]);
  assert.ok(usesLines.length > 0, 'Diagnostic workflow must declare SHA-pinned external actions');
  for (const actionRef of usesLines) {
    assert.match(
      actionRef,
      /^[^@]+@[0-9a-f]{40}$/,
      `Diagnostic workflow action "${actionRef}" must be pinned to a full 40-character commit SHA`,
    );
  }
  assert.match(workflow, /persist-credentials:\s*false/);

  // Preserves exact Xcode 26.4.1 / iOS 26.4 checks, fail-fast build logging, unit tests, and full simulator smoke.
  assert.match(workflow, /Xcode_26\.4\.1\.app/);
  assert.match(workflow, /grep -Fxq 'Xcode 26\.4\.1'/);
  assert.match(workflow, /grep -Fxq 'Build version 17E202'/);
  assert.match(workflow, /grep -Fq 'iphonesimulator26\.4'/);
  assert.match(workflow, /set -o pipefail/);
  assert.match(workflow, /python3 -m unittest -v tests\/ci\/test_ios_simulator_smoke\.py/);
  assert.match(workflow, /python3 scripts\/ios-simulator-smoke\.py/);
  assert.doesNotMatch(workflow, /--simctl-only|--lifecycle-probe-only/);
  assert.match(workflow, /name: Collect fallback CI diagnostics on failure\s*\n {8}if: failure\(\)/);
  assert.match(workflow, /name: Upload iOS Simulator runtime smoke evidence\s*\n {8}if: always\(\)/);
});
