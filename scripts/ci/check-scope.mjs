import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Universal patterns that trigger all CI jobs.
 * Changes to workflow definitions, shared dependency manifests, or CI logic
 * must never bypass verification.
 */
export const UNIVERSAL_PATTERNS = [
  /^\.github\//,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^scripts\/ci\//,
  /^tests\/ci\//,
];

/**
 * Pattern definitions per target subsystem.
 */
export const TARGET_PATTERNS = {
  reader: [
    ...UNIVERSAL_PATTERNS,
    /^src\//,
    /^public\//,
    /^index\.html$/,
    /^vite\.config\.ts$/,
    /^tsconfig.*\.json$/,
    /^tailwind\.config\.js$/,
    /^postcss\.config\.js$/,
    /^components\.json$/,
    /^wrangler.*\.jsonc$/,
    /^playwright\.config\.ts$/,
    /^scripts\/(?!ios-simulator-smoke\.py).*/,
    /^tests\/smoke\//,
  ],
  studio: [
    ...UNIVERSAL_PATTERNS,
    /^studio\//,
    /^src\/gateway\/fixtures\//,
  ],
  'cms-adapter': [
    ...UNIVERSAL_PATTERNS,
    /^src\//,
    /^tests\/sanity\//,
    /^tests\/participation\//,
    /^tests\/performance\//,
    /^scripts\/(?!ios-simulator-smoke\.py).*/,
  ],
  'release-gateway': [
    ...UNIVERSAL_PATTERNS,
    /^src\/gateway\//,
    /^src\/types\//,
    /^src\/utils\//,
    /^tests\/gateway\//,
    /^wrangler.*\.jsonc$/,
  ],
  'collections-browser': [
    ...UNIVERSAL_PATTERNS,
    /^src\//,
    /^tests\/savedScripture\//,
    /^tests\/notebook\//,
    /^scripts\/testing\//,
    /^playwright\.config\.ts$/,
  ],
};

/**
 * Normalizes file paths for matching (standardizes forward slashes, strips leading './').
 */
export function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

/**
 * Matches a list of file paths against regex patterns.
 * Returns true if at least one file matches any pattern.
 */
export function matchesPatterns(files, patterns) {
  for (const file of files) {
    const normalized = normalizePath(file);
    if (!normalized) continue;
    for (const pattern of patterns) {
      if (pattern.test(normalized)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Evaluates whether a target subsystem should run given an event and list of changed files.
 *
 * @param {string} target - Name of the target ('reader', 'studio', etc.)
 * @param {string[]} changedFiles - List of repository-relative changed file paths
 * @param {string} eventName - 'push', 'pull_request', 'workflow_dispatch', etc.
 * @returns {{ shouldRun: boolean, reason: string }}
 */
export function evaluateScope(target, changedFiles, eventName = 'pull_request') {
  if (eventName === 'push') {
    return { shouldRun: true, reason: 'Pushes to main branch require full verification.' };
  }
  if (eventName === 'workflow_dispatch') {
    return { shouldRun: true, reason: 'Manual workflow dispatch requires full execution.' };
  }

  const patterns = TARGET_PATTERNS[target];
  if (!patterns) {
    return { shouldRun: true, reason: `Unknown target "${target}"; defaulting to execution.` };
  }

  if (changedFiles === null || changedFiles === undefined) {
    return { shouldRun: true, reason: 'Changed files could not be determined; safe default to execution.' };
  }

  if (changedFiles.length === 0) {
    return { shouldRun: false, reason: 'No changed files detected.' };
  }

  // Check universal patterns first
  for (const file of changedFiles) {
    const normalized = normalizePath(file);
    for (const pattern of UNIVERSAL_PATTERNS) {
      if (pattern.test(normalized)) {
        return {
          shouldRun: true,
          reason: `Universal dependency or configuration changed: ${normalized}`,
        };
      }
    }
  }

  // Check target-specific patterns
  for (const file of changedFiles) {
    const normalized = normalizePath(file);
    for (const pattern of patterns) {
      if (pattern.test(normalized)) {
        return {
          shouldRun: true,
          reason: `Target-relevant file changed: ${normalized}`,
        };
      }
    }
  }

  return {
    shouldRun: false,
    reason: `No files matching target "${target}" were modified among ${changedFiles.length} changed files.`,
  };
}

/**
 * Retrieves changed files via git diff for a pull request.
 * Falls back to null on failure so evaluateScope defaults safely to execution.
 */
export function getChangedFilesFromGit(baseRef = 'main') {
  const candidates = [
    `origin/${baseRef}`,
    baseRef,
    'HEAD~1',
  ];

  for (const ref of candidates) {
    try {
      const mergeBase = execSync(`git merge-base ${ref} HEAD`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
      if (!mergeBase) continue;
      const diffOutput = execSync(`git diff --name-only ${mergeBase} HEAD`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      return diffOutput
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);
    } catch {
      // Try next ref candidate
    }
  }

  return null;
}

/**
 * Parses CLI arguments.
 */
export function parseArgs(argv) {
  const args = {
    target: '',
    eventName: process.env.GITHUB_EVENT_NAME || 'pull_request',
    baseRef: process.env.GITHUB_BASE_REF || 'main',
    files: null,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--target' && i + 1 < argv.length) {
      args.target = argv[++i];
    } else if (arg === '--event' && i + 1 < argv.length) {
      args.eventName = argv[++i];
    } else if (arg === '--base-ref' && i + 1 < argv.length) {
      args.baseRef = argv[++i];
    } else if (arg === '--files' && i + 1 < argv.length) {
      args.files = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    }
  }

  return args;
}

/**
 * Main CLI execution.
 */
export function runCli(argv = process.argv) {
  const args = parseArgs(argv);
  if (!args.target) {
    console.error('Error: --target <name> argument is required.');
    process.exit(1);
  }

  const changedFiles = args.files !== null
    ? args.files
    : getChangedFilesFromGit(args.baseRef);

  const { shouldRun, reason } = evaluateScope(args.target, changedFiles, args.eventName);

  console.log(`[ci-scope] Target: "${args.target}"`);
  console.log(`[ci-scope] Event: "${args.eventName}"`);
  if (changedFiles) {
    console.log(`[ci-scope] Changed files evaluated: ${changedFiles.length}`);
    if (changedFiles.length > 0 && changedFiles.length <= 15) {
      changedFiles.forEach(f => console.log(`  - ${f}`));
    } else if (changedFiles.length > 15) {
      changedFiles.slice(0, 10).forEach(f => console.log(`  - ${f}`));
      console.log(`  ... and ${changedFiles.length - 10} more`);
    }
  } else {
    console.log('[ci-scope] Changed files could not be queried via git.');
  }
  console.log(`[ci-scope] Result: should_run=${shouldRun}`);
  console.log(`[ci-scope] Reason: ${reason}`);

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `should_run=${shouldRun}\n`);
  }

  return shouldRun;
}

// Run CLI directly when invoked as a script
const isMainModule = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  runCli();
}
