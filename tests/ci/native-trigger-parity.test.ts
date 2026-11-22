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

test('Android retains its shared web-bundle and platform-specific path filters on PR and main push', () => {
  const workflow = readRepoFile('.github/workflows/native-android.yml');
  const prPaths = extractPathsList(extractBlock(workflow, /^ {2}pull_request:\s*$/));
  const pushPaths = extractPathsList(extractBlock(workflow, /^ {2}push:\s*$/));

  assert.deepEqual(prPaths, pushPaths);
  assert.deepEqual(
    prPaths.filter(path => !(ANDROID_ONLY_PATHS as readonly string[]).includes(path)),
    [...SHARED_WEB_BUNDLE_PATHS],
  );
  for (const path of ANDROID_ONLY_PATHS) assert.ok(prPaths.includes(path));

  for (const file of [
    'src/App.tsx',
    'src/screens/TodayScreen.tsx',
    'src/native/lifecycleService.ts',
    'src/participation/drivers/capacitorPreferencesDriver.ts',
    'public/worksheets/practice.pdf',
    'index.html',
    'vite.config.ts',
    'tsconfig.app.json',
    'tailwind.config.js',
    'postcss.config.js',
    'capacitor.config.ts',
    'package.json',
    'package-lock.json',
    'android/app/build.gradle',
  ]) {
    assert.ok(matchesAnyPathFilter(file, prPaths), `Android must cover ${file}`);
  }

  for (const file of [
    'ios/App/App/AppDelegate.swift',
    'scripts/ios-simulator-snapshot.py',
    'scripts/ios-simulator-smoke.py',
    'tests/ci/test_ios_simulator_smoke.py',
    '.github/workflows/native-ios.yml',
    'docs/testing/native-ci-trigger-parity.md',
    'README.md',
    'tests/ci/native-trigger-parity.test.ts',
    'tests/sanity/challengePlayerBoundary.test.ts',
    'studio/package.json',
    'supabase/migrations/20261110_example.sql',
  ]) {
    assert.ok(!matchesAnyPathFilter(file, prPaths), `Android should exclude ${file}`);
  }
});

test('iOS evaluates every PR diff and runs full runtime acceptance for every main push and dispatch', () => {
  const workflow = readRepoFile('.github/workflows/native-ios.yml');
  const pr = extractBlock(workflow, /^ {2}pull_request:\s*$/);
  const push = extractBlock(workflow, /^ {2}push:\s*$/);
  const dispatch = extractBlock(workflow, /^ {2}workflow_dispatch:\s*$/);
  const scope = extractBlock(workflow, /^ {2}scope:\s*$/);
  const build = extractBlock(workflow, /^ {2}ios-simulator:\s*$/);
  const runtime = extractBlock(workflow, /^ {2}ios-runtime:\s*$/);
  const summary = extractBlock(workflow, /^ {2}ios-summary:\s*$/);

  assert.match(pr, /^ {4}branches: \[main\]$/m);
  assert.match(push, /^ {4}branches: \[main\]$/m);
  assert.doesNotMatch(pr + push, /paths(?:-ignore)?:/);
  assert.doesNotMatch(workflow, /^ {2}merge_group:/m);
  assert.match(workflow, /group: .*github\.event_name == 'pull_request'.*pull_request\.number.*\|\| github\.run_id/);
  assert.match(workflow, /cancel-in-progress: .*github\.event_name == 'pull_request'/);
  assert.match(scope, /if: github\.event_name == 'pull_request'/);
  assert.match(scope, /runs-on: ubuntu-24\.04/);
  assert.match(scope, /fetch-depth: 0/);
  assert.match(scope, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(scope, /PR_BASE_SHA: .*github\.event\.pull_request\.base\.sha/);
  assert.match(scope, /PR_HEAD_SHA: .*github\.event\.pull_request\.head\.sha/);
  assert.match(scope, /run: node scripts\/ci\/ios-scope\.mjs/);

  assert.match(build, /needs: scope/);
  assert.match(build, /if: .* !cancelled\(\) && github\.event_name == 'pull_request' && \(needs\.scope\.result != 'success' \|\| needs\.scope\.outputs\.scope != 'none'\)/);
  assert.match(runtime, /needs: scope/);
  assert.match(runtime, /if: .* !cancelled\(\) && \(github\.event_name != 'pull_request' \|\| needs\.scope\.result != 'success' \|\| \(needs\.scope\.outputs\.scope != 'none' && needs\.scope\.outputs\.scope != 'build'\)\)/);
  assert.match(dispatch, /run_lifecycle_probe:\s*\n.*\n {8}type: boolean\s*\n {8}default: false/);
  assert.match(summary, /if: always\(\)/);
  assert.match(summary, /needs: \[scope, ios-simulator, ios-runtime\]/);
});

test('The iOS jobs share strict build checks, with simulator provisioning and acceptance confined to runtime', () => {
  const workflow = readRepoFile('.github/workflows/native-ios.yml');
  const build = extractBlock(workflow, /^ {2}ios-simulator:\s*$/);
  const runtime = extractBlock(workflow, /^ {2}ios-runtime:\s*$/);
  const helper = readRepoFile('scripts/ci/build-ios-simulator.sh');

  for (const job of [build, runtime]) {
    assert.match(job, /runs-on: macos-26/);
    assert.match(job, /ref: \$\{\{ github\.sha \}\}/);
    assert.match(job, /source scripts\/ci\/build-ios-simulator\.sh/);
    for (const command of [
      'select_ios_xcode', 'prepare_ios_project', 'build_unsigned_ios_app',
      'verify_ios_bundle', 'run_ios_smoke_unit_tests',
    ]) {
      assert.match(job, new RegExp(`^ {10}${command}\\b`, 'm'));
    }
  }
  assert.match(build, /name: Signing-free iOS Simulator build/);
  assert.match(workflow, /shell: bash/);
  assert.doesNotMatch(workflow, /continue-on-error/);

  for (const requirement of [
    'git rev-parse HEAD', 'Xcode_26.4.1.app', 'Build version 17E202', 'xcodebuild -showsdks',
    'npm ci', 'npm run build', 'npx cap sync ios', 'CapApp-SPM/Package.swift',
    'CapacitorApp', 'CapacitorPreferences', '-sdk iphonesimulator26.4',
    "-destination 'generic/platform=iOS Simulator'", 'CODE_SIGNING_ALLOWED=NO',
    'CODE_SIGNING_REQUIRED=NO', "CODE_SIGN_IDENTITY=''", 'Print :CFBundleIdentifier',
    'com.example.bibleberry.r20poc', 'public/index.html', "'*.js' -size +0c",
    'python3 -m unittest -v tests/ci/test_ios_simulator_smoke.py',
  ]) assert.ok(helper.includes(requirement), `Build helper must include ${requirement}`);
  assert.doesNotMatch(build + helper, /simctl|downloadPlatform|importPlatform|ios-simulator-(?:snapshot|smoke)\.py|XCUITest/);

  assert.match(runtime, /xcodebuild -downloadPlatform iOS/);
  assert.match(runtime, /xcodebuild -importPlatform/);
  assert.match(runtime, /id: runtime-smoke\s*\n {8}run: \|/);
  assert.match(runtime, /python3 scripts\/ios-simulator-smoke\.py \\[^]+?--app-path .*App\.app[^]+?--derived-data[^]+?--evidence-dir/);
  assert.doesNotMatch(runtime, /--simctl-only|download-artifact/);
  assert.match(runtime, /name: Collect fallback CI diagnostics on failure\s*\n {8}if: failure\(\)/);
  assert.match(runtime, /name: Record runtime evidence provenance\s*\n {8}if: always\(\)/);
  assert.match(runtime, /name: Upload iOS Simulator runtime smoke evidence\s*\n {8}if: always\(\)/);
  assert.match(runtime, /name: bibleberry-r20-4-ios-simulator-evidence-.*github\.run_attempt/);
  assert.match(runtime, /name: bibleberry-r20-3-ios-simulator-app-/);
  assert.match(runtime, /github\.event_name == 'workflow_dispatch' && inputs\.run_lifecycle_probe == true/);
  assert.match(runtime, /VITE_ENABLE_NATIVE_LIFECYCLE_PROBE: 'true'/);
  assert.match(runtime, /--lifecycle-probe-only/);
  assert.match(runtime, /name: bibleberry-r20-4-ios-lifecycle-probe-evidence-/);
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
