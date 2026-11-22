import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { detectIosScope } from '../../scripts/ci/ios-scope.mjs';

function repository(t: TestContext) {
  const cwd = mkdtempSync(join(tmpdir(), 'ios-scope-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const write = (path: string, content = 'example\n') => {
    const file = join(cwd, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  };
  const commit = (message: string) => {
    git('add', '-A');
    git('commit', '--allow-empty', '-m', message);
    return git('rev-parse', 'HEAD');
  };

  git('init', '--initial-branch=main');
  git('config', 'user.name', 'iOS Scope Test');
  git('config', 'user.email', 'ios-scope@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  write('src/native/shared.ts', 'export const shared = true;\n');
  write('src/components/Bridge.ts', 'import { Capacitor } from "@capacitor/core";\n');
  const ancestor = commit('Common ancestor');
  write('docs/base.md');
  const base = commit('Base moved forward');

  return {
    cwd,
    git,
    write,
    pullRequest(change: () => void) {
      git('checkout', '--detach', ancestor);
      change();
      const head = commit('PR head');
      git('checkout', '--detach', base);
      git('merge', '--no-ff', '--no-edit', head);
      return { event: 'pull_request', cwd, base, head, build: git('rev-parse', 'HEAD') };
    },
  };
}

test('web bundle changes use the fast build, and unrelated PRs need neither macOS job', async t => {
  for (const [file, expected] of [
    ['src/components/month/MonthAgenda.tsx', 'build'],
    ['src/screens/TodayScreen.tsx', 'build'],
    ['src/index.css', 'build'],
    ['public/images/reader-cover.svg', 'build'],
    ['public/worksheets/practice journal.pdf', 'build'],
    ['docs/testing/native-ci-trigger-parity.md', 'none'],
    ['tests/smoke/navigation.spec.ts', 'none'],
    ['android/app/build.gradle', 'none'],
  ]) {
    await t.test(file, t => {
      const repo = repository(t);
      assert.equal(detectIosScope(repo.pullRequest(() => repo.write(file))).scope, expected);
    });
  }
});

test('native, shared build and unknown inputs require build and full runtime on PRs', async t => {
  for (const file of [
    'ios/App/App/AppDelegate.swift',
    'ios/App/AppUITests/AppUITests.swift',
    'ios/App/CapApp-SPM/Package.resolved',
    'ios/Podfile.lock',
    'capacitor.config.ts',
    'package.json',
    'package-lock.json',
    '.npmrc',
    'src/native/lifecycleService.ts',
    'src/participation/drivers/capacitorPreferencesDriver.ts',
    'src/participation/defaultGuestStore.ts',
    'src/deepLinkIngress/index.ts',
    'src/readerShell/navigation/navigationBrowser.ts',
    'src/shelfPersistence/defaultGuestShelfStore.ts',
    'src/readerProfile/platformStore.ts',
    'src/App.tsx',
    'scripts/ios-simulator-smoke.py',
    'scripts/ios-simulator-snapshot.py',
    'tests/ci/test_ios_simulator_smoke.py',
    'tests/nativeLifecycle.test.ts',
    '.github/workflows/native-ios.yml',
    '.github/workflows/native-ios-runner-comparison.yml',
    'scripts/ci/build-ios-simulator.sh',
    'scripts/ci/ios-scope.mjs',
    'tests/ci/ios-scope.test.ts',
    'tests/ci/native-trigger-parity.test.ts',
    'tests/ci/draft-pr-ci-policy.test.ts',
    'index.html',
    'vite.config.ts',
    'tsconfig.app.json',
    'tailwind.config.js',
    'postcss.config.js',
    'public/config.js',
    'build/new-packaging-input',
  ]) {
    await t.test(file, t => {
      const repo = repository(t);
      const request = repo.pullRequest(() => {
        repo.write('src/components/month/MonthAgenda.tsx');
        repo.write(file);
      });
      const decision = detectIosScope(request);
      assert.equal(decision.scope, 'runtime');
      assert.notEqual(decision.reason, 'PR comparison could not be established');
    });
  }
});

test('renames, removed bridge imports, and new bridge wiring cannot look web-only', async t => {
  await t.test('native file renamed to a web path', t => {
    const repo = repository(t);
    const request = repo.pullRequest(() => {
      repo.write('src/components/MonthAgenda.tsx');
      renameSync(join(repo.cwd, 'src/native/shared.ts'), join(repo.cwd, 'src/components/shared.ts'));
    });
    assert.equal(detectIosScope(request).reason, 'Native integration source changed');
  });

  await t.test('old blob contains the native import', t => {
    const repo = repository(t);
    const request = repo.pullRequest(() => repo.write('src/components/Bridge.ts'));
    assert.equal(detectIosScope(request).reason, 'Changed web source references native integration');
  });

  await t.test('new blob wires up WKWebView in a web-named file', t => {
    const repo = repository(t);
    const request = repo.pullRequest(() => repo.write(
      'src/components/New.tsx',
      'window.webkit.messageHandlers.bridge.postMessage({})',
    ));
    assert.equal(detectIosScope(request).reason, 'Changed web source references native integration');
  });
});

test('scope has no 300-path cutoff', t => {
  const repo = repository(t);
  const request = repo.pullRequest(() => {
    for (let i = 0; i < 305; i++) repo.write('docs/examples/' + i + '.md');
    repo.write('ios/App/App/AppDelegate.swift');
  });
  assert.equal(detectIosScope(request).reason, 'Native, packaging, CI, or unclassified input changed');
});

test('unavailable, empty or ambiguous PR comparisons require runtime', async t => {
  await t.test('missing metadata, nonmatching checkout and empty diff', t => {
    const repo = repository(t);
    const request = repo.pullRequest(() => {});
    for (const candidate of [
      request,
      { ...request, base: '' },
      { ...request, head: request.base },
      { ...request, build: request.head },
    ]) {
      assert.equal(detectIosScope(candidate).reason, 'PR comparison could not be established');
    }
  });

  await t.test('failed Git change listing', t => {
    const repo = repository(t);
    const request = repo.pullRequest(() => repo.write('src/components/Web.ts'));
    const tree = repo.git('rev-parse', 'HEAD^{tree}');
    rmSync(join(repo.cwd, '.git/objects', tree.slice(0, 2), tree.slice(2)));
    assert.equal(detectIosScope(request).reason, 'PR comparison could not be established');
  });

  await t.test('control characters and symlinks are out of scope for a safe skip', t => {
    const repo = repository(t);
    const request = repo.pullRequest(() => repo.write('docs/ambiguous\nname.md'));
    assert.equal(detectIosScope(request).reason, 'PR comparison could not be established');

    const second = repository(t);
    const symlinkRequest = second.pullRequest(() => {
      mkdirSync(join(second.cwd, 'public'));
      symlinkSync('../src/native/shared.ts', join(second.cwd, 'public/cover.svg'));
    });
    assert.equal(detectIosScope(symlinkRequest).reason, 'PR comparison could not be established');
  });
});

test('main pushes and manual dispatch require runtime without PR diff metadata', () => {
  for (const event of ['push', 'workflow_dispatch']) {
    assert.equal(detectIosScope({ event }).scope, 'runtime');
  }
});
