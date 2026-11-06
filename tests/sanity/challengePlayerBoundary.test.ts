import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

/**
 * Static import-boundary verification for the shared Challenge player (Issue #41, A1).
 *
 * The production-safe player and renderers must be importable without transitively pulling in
 * Developer Studio source selection, fixtures, Lab storage, live catalog fetching, or BerryMark
 * compiler/file-review tooling. This walks every relative import reachable from the shared
 * entry points and checks both module identity and source content.
 */

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const sharedEntryPoints = [
  'src/components/challenge/ChallengePlayer.tsx',
  'src/components/challenge/CmsContentBlocks.tsx',
  'src/components/challenge/challengePlayerModel.ts',
]

const forbiddenModules = [
  'src/cms/sanity/SanityChallengeLab.tsx',
  'src/cms/sanity/BerryMarkLocalPreview.tsx',
  'src/cms/sanity/berryMarkPreview.ts',
  'src/cms/sanity/catalog.ts',
  'src/cms/sanity/readPublishedChallenges.ts',
  'src/cms/sanity/developmentFixture.ts',
  'src/cms/sanity/labState.ts',
  'src/cms/sanity/index.ts',
  'src/components/InteractiveChallengeLab.tsx',
  'src/components/DeveloperStudio.tsx',
  'src/data/interactiveChallenges.ts',
  'src/App.tsx',
]

const allowedPackages = new Set(['react', '@portabletext/react', 'lucide-react'])

const forbiddenSourcePatterns: [RegExp, string][] = [
  [/\blocalStorage\b/, 'localStorage access'],
  [/\bsessionStorage\b/, 'sessionStorage access'],
  [/\bindexedDB\b/, 'IndexedDB access'],
  [/\bfetch\s*\(/, 'network fetch'],
  [/api\.sanity\.io/, 'Sanity API endpoint'],
  [/bibleberry-[a-z-]+-v1/, 'browser storage namespace'],
  [/import\.meta\.env/, 'environment-dependent developer gating'],
  [/Developer Studio/, 'Developer Studio coupling'],
]

function parseSourceFile(file: string, source: string) {
  return ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
}

function stripComments(file: string, source: string) {
  const sf = parseSourceFile(file, source)
  const printer = ts.createPrinter({ removeComments: true })
  return printer.printFile(sf)
}

function collectImports(file: string, source: string) {
  const sf = parseSourceFile(file, source)
  const specifiers: { specifier: string; typeOnly: boolean }[] = []

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause
      let typeOnly = Boolean(clause?.isTypeOnly)
      if (!typeOnly && clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        typeOnly = clause.namedBindings.elements.length > 0
          && clause.namedBindings.elements.every(element => element.isTypeOnly)
      }
      specifiers.push({ specifier: node.moduleSpecifier.text, typeOnly })
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      let typeOnly = node.isTypeOnly
      if (!typeOnly && node.exportClause && ts.isNamedExports(node.exportClause)) {
        typeOnly = node.exportClause.elements.length > 0
          && node.exportClause.elements.every(element => element.isTypeOnly)
      }
      specifiers.push({ specifier: node.moduleSpecifier.text, typeOnly })
    } else if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length > 0
      && ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push({ specifier: node.arguments[0].text, typeOnly: false })
    }
    ts.forEachChild(node, visit)
  }

  visit(sf)
  return specifiers
}

function walkSharedGraph() {
  const visited = new Map<string, string>()
  const packages = new Set<string>()
  const queue = sharedEntryPoints.map(entry => resolve(repositoryRoot, entry))
  while (queue.length > 0) {
    const file = queue.shift()!
    if (visited.has(file)) continue
    const rawSource = readFileSync(file, 'utf8')
    const executableSource = stripComments(file, rawSource)
    visited.set(file, executableSource)
    for (const { specifier, typeOnly } of collectImports(file, rawSource)) {
      if (specifier.startsWith('.')) {
        if (typeOnly) {
          // Type-only imports are erased at build time; still record them for the identity check.
          visited.set(resolve(dirname(file), specifier), visited.get(resolve(dirname(file), specifier)) ?? '')
          continue
        }
        queue.push(resolve(dirname(file), specifier))
      } else {
        packages.add(specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0])
      }
    }
  }
  return { visited, packages }
}

test('shared Challenge player graph excludes developer-only, fixture, storage, and catalog modules', () => {
  const { visited } = walkSharedGraph()
  const reached = [...visited.keys()].map(file => relative(repositoryRoot, file))
  for (const entry of sharedEntryPoints) assert.ok(reached.includes(entry), `${entry} should be reachable`)
  for (const forbidden of forbiddenModules) {
    assert.equal(reached.includes(forbidden), false, `shared player must not import ${forbidden}`)
  }
})

test('shared Challenge player runtime modules use only approved packages', () => {
  const { packages } = walkSharedGraph()
  for (const name of packages) assert.ok(allowedPackages.has(name), `unexpected package dependency: ${name}`)
})

test('shared Challenge player runtime source performs no storage, network, or developer gating', () => {
  const { visited } = walkSharedGraph()
  for (const [file, source] of visited) {
    if (!source) continue
    for (const [pattern, description] of forbiddenSourcePatterns) {
      assert.doesNotMatch(source, pattern, `${relative(repositoryRoot, file)} contains ${description}`)
    }
  }
})

test('Lab and read-only preview consume the shared renderers instead of private copies', () => {
  const lab = readFileSync(resolve(repositoryRoot, 'src/cms/sanity/SanityChallengeLab.tsx'), 'utf8')
  const preview = readFileSync(resolve(repositoryRoot, 'src/cms/sanity/BerryMarkLocalPreview.tsx'), 'utf8')

  assert.match(lab, /from '\.\.\/\.\.\/components\/challenge\/ChallengePlayer\.tsx'/)
  assert.doesNotMatch(lab, /function CmsBlockView|PortableText/)

  assert.match(preview, /from '\.\.\/\.\.\/components\/challenge\/CmsContentBlocks\.tsx'/)
  assert.doesNotMatch(preview, /SanityChallengeLab|labState|ChallengePlayer/)
  // Read-only preview never receives Scripture save controls.
  assert.doesNotMatch(preview, /scriptureSave=/)
})
