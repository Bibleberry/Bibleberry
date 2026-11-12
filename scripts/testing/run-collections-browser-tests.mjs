import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const playwrightCli = resolve(dirname(require.resolve('@playwright/test')), 'cli.js')
const suites = [
  [
    '--config',
    'tests/savedScripture/playwright.config.ts',
    'tests/savedScripture/saved-scripture-collection.spec.ts',
  ],
  [
    '--config',
    'tests/notebook/playwright.config.ts',
    'tests/notebook/field-notebook.spec.ts',
  ],
]

let failed = false

for (const args of suites) {
  const result = spawnSync(process.execPath, [playwrightCli, 'test', ...args], {
    stdio: 'inherit',
  })

  if (result.error) {
    console.error(result.error)
    failed = true
  } else if (result.status !== 0) {
    failed = true
  }
}

process.exitCode = failed ? 1 : 0
