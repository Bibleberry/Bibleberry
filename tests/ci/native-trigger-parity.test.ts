import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SHARED_WEB_BUNDLE_PATHS = [
  'capacitor.config.ts',
  'package.json',
  'package-lock.json',
  'src/**',
  'public/**',
  'index.html',
  'vite.config.*',
  'tsconfig*.json',
  'tailwind.config.js',
  'postcss.config.js',
] as const;

const ANDROID_ONLY_PATHS = [
  'android/**',
  '.github/workflows/native-android.yml',
] as const;

const IOS_ONLY_PATHS = [
  'ios/**',
  'scripts/ios-simulator-snapshot.py',
  'scripts/ios-simulator-smoke.py',
  'tests/ci/test_ios_simulator_smoke.py',
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

function extractPathsList(eventBlock: string): string[] {
  const pathsBlock = extractBlock(eventBlock, /^ {4}paths:\s*$/);
  const paths: string[] = [];

  for (const line of pathsBlock.split(/\r?\n/).slice(1)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const match = trimmed.match(/^-\s+(.+)$/);
    assert.ok(match, `Unexpected line inside paths block: ${line}`);
    paths.push(match[1].replace(/^['"]|['"]$/g, ''));
  }

  return paths;
}

/**
 * Converts a GitHub Actions path-filter glob pattern (`*` single segment, `**` recursive)
 * into a RegExp for deterministic static verification.
 */
function globToRegExp(pattern: string): RegExp {
  let regex = '^';
  let i = 0;
  while (i < pattern.length) {
    const char = pattern[i];
    if (char === '*' && pattern[i + 1] === '*') {
      if (pattern[i + 2] === '/') {
        regex += '(?:.*/)?';
        i += 3;
      } else {
        regex += '.*';
        i += 2;
      }
      continue;
    }
    if (char === '*') {
      regex += '[^/]*';
      i += 1;
      continue;
    }
    if (char === '?') {
      regex += '[^/]';
      i += 1;
      continue;
    }
    regex += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    i += 1;
  }
  regex += '$';
  return new RegExp(regex);
}

function matchesAnyPathFilter(filePath: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => globToRegExp(pattern).test(filePath));
}

test('Native iOS and Android workflows share identical web-bundle and packaging path filters on PR and main push', () => {
  const iosWorkflow = readRepoFile('.github/workflows/native-ios.yml');
  const androidWorkflow = readRepoFile('.github/workflows/native-android.yml');

  const iosPrPaths = extractPathsList(extractBlock(iosWorkflow, /^ {2}pull_request:\s*$/));
  const iosPushPaths = extractPathsList(extractBlock(iosWorkflow, /^ {2}push:\s*$/));
  const androidPrPaths = extractPathsList(extractBlock(androidWorkflow, /^ {2}pull_request:\s*$/));
  const androidPushPaths = extractPathsList(extractBlock(androidWorkflow, /^ {2}push:\s*$/));

  assert.deepEqual(
    iosPrPaths,
    iosPushPaths,
    'native-ios.yml pull_request.paths and push.paths must stay identical',
  );
  assert.deepEqual(
    androidPrPaths,
    androidPushPaths,
    'native-android.yml pull_request.paths and push.paths must stay identical',
  );

  for (const sharedPath of SHARED_WEB_BUNDLE_PATHS) {
    assert.ok(
      iosPrPaths.includes(sharedPath),
      `native-ios.yml must include shared bundle input "${sharedPath}"`,
    );
    assert.ok(
      androidPrPaths.includes(sharedPath),
      `native-android.yml must include shared bundle input "${sharedPath}"`,
    );
  }

  const iosNonPlatformPaths = iosPrPaths.filter(
    (entry) => !(IOS_ONLY_PATHS as readonly string[]).includes(entry),
  );
  const androidNonPlatformPaths = androidPrPaths.filter(
    (entry) => !(ANDROID_ONLY_PATHS as readonly string[]).includes(entry),
  );

  assert.deepEqual(
    iosNonPlatformPaths,
    [...SHARED_WEB_BUNDLE_PATHS],
    'native-ios.yml non-platform paths must match the exact shared web-bundle list without drift or redundant src/ subsets',
  );
  assert.deepEqual(
    androidNonPlatformPaths,
    [...SHARED_WEB_BUNDLE_PATHS],
    'native-android.yml non-platform paths must match the exact shared web-bundle list without drift or redundant src/ subsets',
  );

  for (const iosOnly of IOS_ONLY_PATHS) {
    assert.ok(iosPrPaths.includes(iosOnly), `native-ios.yml must retain iOS-specific path "${iosOnly}"`);
    assert.ok(!androidPrPaths.includes(iosOnly), `native-android.yml must not watch iOS-only path "${iosOnly}"`);
  }

  for (const androidOnly of ANDROID_ONLY_PATHS) {
    assert.ok(androidPrPaths.includes(androidOnly), `native-android.yml must retain Android-specific path "${androidOnly}"`);
    assert.ok(!iosPrPaths.includes(androidOnly), `native-ios.yml must not watch Android-only path "${androidOnly}"`);
  }
});

test('Native path filters match shipped web-bundle inputs, isolate platform inputs, and exclude unrelated docs/tests/services', () => {
  const iosPaths = extractPathsList(
    extractBlock(readRepoFile('.github/workflows/native-ios.yml'), /^ {2}pull_request:\s*$/),
  );
  const androidPaths = extractPathsList(
    extractBlock(readRepoFile('.github/workflows/native-android.yml'), /^ {2}pull_request:\s*$/),
  );

  const sharedTriggeredFiles = [
    'src/App.tsx',
    'src/screens/TodayScreen.tsx',
    'src/native/lifecycleService.ts',
    'src/participation/defaultGuestStore.ts',
    'src/participation/drivers/capacitorPreferencesDriver.ts',
    'public/favicon.svg',
    'public/images/sabbath-development-study.svg',
    'public/worksheets/weekly-rhythm-pilot-journal.pdf',
    'index.html',
    'vite.config.ts',
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.node.json',
    'tailwind.config.js',
    'postcss.config.js',
    'capacitor.config.ts',
    'package.json',
    'package-lock.json',
  ];

  for (const file of sharedTriggeredFiles) {
    assert.equal(
      matchesAnyPathFilter(file, iosPaths),
      true,
      `Shared web-bundle input "${file}" must trigger native-ios.yml`,
    );
    assert.equal(
      matchesAnyPathFilter(file, androidPaths),
      true,
      `Shared web-bundle input "${file}" must trigger native-android.yml`,
    );
  }

  const iosOnlyFiles = [
    'ios/App/App/AppDelegate.swift',
    'ios/App/AppUITests/AppUITests.swift',
    'scripts/ios-simulator-snapshot.py',
    'scripts/ios-simulator-smoke.py',
    'tests/ci/test_ios_simulator_smoke.py',
    '.github/workflows/native-ios.yml',
  ];

  for (const file of iosOnlyFiles) {
    assert.equal(matchesAnyPathFilter(file, iosPaths), true, `iOS input "${file}" must trigger native-ios.yml`);
    assert.equal(matchesAnyPathFilter(file, androidPaths), false, `iOS-only input "${file}" must not trigger native-android.yml`);
  }

  const androidOnlyFiles = [
    'android/app/build.gradle',
    'android/app/src/main/java/com/example/bibleberry/r20poc/MainActivity.java',
    '.github/workflows/native-android.yml',
  ];

  for (const file of androidOnlyFiles) {
    assert.equal(matchesAnyPathFilter(file, androidPaths), true, `Android input "${file}" must trigger native-android.yml`);
    assert.equal(matchesAnyPathFilter(file, iosPaths), false, `Android-only input "${file}" must not trigger native-ios.yml`);
  }

  const excludedNonBundleFiles = [
    'docs/testing/native-ci-trigger-parity.md',
    'README.md',
    'tests/ci/native-trigger-parity.test.ts',
    'tests/sanity/challengePlayerBoundary.test.ts',
    'tests/gateway/releaseGateway.test.ts',
    'tests/smoke/navigation.spec.ts',
    'scripts/ci/check-scope.mjs',
    'studio/package.json',
    'supabase/migrations/20261110_example.sql',
    'eslint.config.js',
    'playwright.config.ts',
    'wrangler.jsonc',
    'wrangler.staging.jsonc',
    'components.json',
    '.github/workflows/ci.yml',
  ];

  for (const file of excludedNonBundleFiles) {
    assert.equal(
      matchesAnyPathFilter(file, iosPaths),
      false,
      `Non-bundle file "${file}" must not trigger native-ios.yml`,
    );
    assert.equal(
      matchesAnyPathFilter(file, androidPaths),
      false,
      `Non-bundle file "${file}" must not trigger native-android.yml`,
    );
  }
});

test('Native iOS preserves simulator smoke, strict failure diagnostics, lifecycle probe, read-only security, and stays outside merge_group', () => {
  const workflow = readRepoFile('.github/workflows/native-ios.yml');

  // Must not become a merge_group gate without a separate owner decision.
  assert.doesNotMatch(workflow, /^ {2}merge_group:/m, 'native-ios.yml must not subscribe to merge_group without separate owner decision');

  // Must have no Draft-PR suppression guard.
  assert.doesNotMatch(workflow, /pull_request\.draft/, 'native-ios.yml must not add a Draft-PR guard');

  // Preserves concurrency isolation and read-only security posture.
  assert.match(workflow, /^permissions:\s*\n {2}contents: read\s*$/m);
  assert.match(workflow, /group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}/);
  assert.match(workflow, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  assert.doesNotMatch(workflow, /pull_request_target|\bsecrets\.|self-hosted|:\s*write\b/);

  const usesLines = [...workflow.matchAll(/uses:\s*([^\s#]+)/g)].map((match) => match[1]);
  assert.ok(usesLines.length > 0, 'native-ios.yml must declare SHA-pinned actions');
  for (const actionRef of usesLines) {
    assert.match(actionRef, /^[^@]+@[0-9a-f]{40}$/, `native-ios.yml action "${actionRef}" must be pinned to a 40-char SHA`);
  }
  assert.match(workflow, /persist-credentials:\s*false/);

  // Preserves Xcode 26.4.1, macos-26 runner, smoke unit tests, runtime smoke, fallback diagnostics, and evidence upload.
  assert.match(workflow, /^ {4}runs-on: macos-26\s*$/m);
  assert.match(workflow, /Xcode_26\.4\.1\.app/);
  assert.match(workflow, /python3 -m unittest -v tests\/ci\/test_ios_simulator_smoke\.py/);
  assert.match(workflow, /python3 scripts\/ios-simulator-smoke\.py/);
  assert.match(workflow, /name: Collect fallback CI diagnostics on failure\s*\n {8}if: failure\(\)/);
  assert.match(workflow, /name: Upload iOS Simulator runtime smoke evidence\s*\n {8}if: always\(\)/);
  assert.match(workflow, /name: bibleberry-r20-4-ios-simulator-evidence/);
  assert.match(workflow, /name: bibleberry-r20-3-ios-simulator-app/);

  // Preserves workflow_dispatch opt-in lifecycle probe.
  const dispatchBlock = extractBlock(workflow, /^ {2}workflow_dispatch:\s*$/);
  assert.match(dispatchBlock, /run_lifecycle_probe:/);
  assert.match(dispatchBlock, /type: boolean/);
  assert.match(dispatchBlock, /default: false/);
  assert.match(
    workflow,
    /if: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.run_lifecycle_probe == true \}\}/,
  );
  assert.match(workflow, /VITE_ENABLE_NATIVE_LIFECYCLE_PROBE: 'true'/);
  assert.match(workflow, /--lifecycle-probe-only/);
  assert.match(workflow, /name: bibleberry-r20-4-ios-lifecycle-probe-evidence/);
});

test('Native Android preserves debug APK validation path, Draft-PR policy from Silver Badger, and unfiltered merge_group', () => {
  const workflow = readRepoFile('.github/workflows/native-android.yml');
  const prBlock = extractBlock(workflow, /^ {2}pull_request:\s*$/);
  const mergeGroupBlock = extractBlock(workflow, /^ {2}merge_group:\s*$/);

  assert.match(prBlock, /^ {4}types: \[opened, reopened, synchronize, ready_for_review\]\s*$/m);
  assert.doesNotMatch(workflow, /pull_request\.draft/);
  assert.match(mergeGroupBlock, /^ {4}types: \[checks_requested\]\s*\n {4}branches: \[main\]\s*$/m);
  assert.doesNotMatch(mergeGroupBlock, /paths:/);

  // Debug APK build, verification, and artifact upload stay intact.
  assert.match(workflow, /\.\/gradlew :app:assembleDebug :app:testDebugUnitTest --no-daemon/);
  assert.match(workflow, /package: name='com\.example\.bibleberry\.r20poc'/);
  assert.match(workflow, /unzip -Z1 "\$APK" \| grep -Fx 'assets\/public\/index\.html'/);
  assert.match(workflow, /name: bibleberry-r20-2a-debug-apk/);
});
