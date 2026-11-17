import test from 'node:test'
import assert from 'node:assert/strict'
import {
  NOTEBOOK_ROUTE_HASH,
  NOTEBOOK_ROUTE_ALIASES,
  SAVED_SCRIPTURE_ROUTE_HASH,
  SAVED_SCRIPTURE_ROUTE_ALIASES,
  LIBRARY_ROUTE_HASH,
  LIBRARY_ROUTE_ALIASES,
  parseAppIntegrationRoute,
  buildNotebookRoute,
  buildSavedScriptureRoute,
  buildLibraryRoute,
  isHubCardAnnouncementsEnabled,
} from '../../src/appIntegration/appRoutes.ts'

test('appIntegrationRoutes parses canonical and alias routes when feature flags are enabled', () => {
  const options = { fieldNotebookEnabled: true, savedScriptureEnabled: true, historicalLibraryEnabled: true }

  assert.equal(parseAppIntegrationRoute('#/notebook', options), 'notebook')
  assert.equal(parseAppIntegrationRoute('#/field-notebook', options), 'notebook')
  assert.equal(parseAppIntegrationRoute('#/saved-scripture', options), 'savedScripture')
  assert.equal(parseAppIntegrationRoute('#/savedScripture', options), 'savedScripture')
  assert.equal(parseAppIntegrationRoute('#/library', options), 'library')

  // Supports trailing slash normalization and query param detachment
  assert.equal(parseAppIntegrationRoute('#/notebook/', options), 'notebook')
  assert.equal(parseAppIntegrationRoute('#/saved-scripture?origin=hub', options), 'savedScripture')
  assert.equal(parseAppIntegrationRoute('#/library/', options), 'library')
  assert.equal(parseAppIntegrationRoute('#/library?origin=archive', options), 'library')
})

test('appIntegrationRoutes fails closed when feature flags are disabled', () => {
  const allDisabled = { fieldNotebookEnabled: false, savedScriptureEnabled: false, historicalLibraryEnabled: false }
  assert.equal(parseAppIntegrationRoute('#/notebook', allDisabled), null)
  assert.equal(parseAppIntegrationRoute('#/field-notebook', allDisabled), null)
  assert.equal(parseAppIntegrationRoute('#/saved-scripture', allDisabled), null)
  assert.equal(parseAppIntegrationRoute('#/savedScripture', allDisabled), null)
  assert.equal(parseAppIntegrationRoute('#/library', allDisabled), null)

  const onlyNotebook = { fieldNotebookEnabled: true, savedScriptureEnabled: false }
  assert.equal(parseAppIntegrationRoute('#/notebook', onlyNotebook), 'notebook')
  assert.equal(parseAppIntegrationRoute('#/saved-scripture', onlyNotebook), null)
  assert.equal(parseAppIntegrationRoute('#/library', onlyNotebook), null)

  const onlySavedScripture = { fieldNotebookEnabled: false, savedScriptureEnabled: true }
  assert.equal(parseAppIntegrationRoute('#/notebook', onlySavedScripture), null)
  assert.equal(parseAppIntegrationRoute('#/saved-scripture', onlySavedScripture), 'savedScripture')
  assert.equal(parseAppIntegrationRoute('#/library', onlySavedScripture), null)

  const onlyLibrary = { fieldNotebookEnabled: false, savedScriptureEnabled: false, historicalLibraryEnabled: true }
  assert.equal(parseAppIntegrationRoute('#/library', onlyLibrary), 'library')
  assert.equal(parseAppIntegrationRoute('#/notebook', onlyLibrary), null)
  assert.equal(parseAppIntegrationRoute('#/saved-scripture', onlyLibrary), null)
})

test('appIntegrationRoutes rejects invalid hashes, malformed strings, control characters, and backslashes', () => {
  const options = { fieldNotebookEnabled: true, savedScriptureEnabled: true }

  assert.equal(parseAppIntegrationRoute(null, options), null)
  assert.equal(parseAppIntegrationRoute(undefined, options), null)
  assert.equal(parseAppIntegrationRoute(123, options), null)
  assert.equal(parseAppIntegrationRoute('', options), null)
  assert.equal(parseAppIntegrationRoute('/notebook', options), null)
  assert.equal(parseAppIntegrationRoute('#notebook', options), null)
  assert.equal(parseAppIntegrationRoute('#/notebook\\evil', options), null)
  assert.equal(parseAppIntegrationRoute('#/unknown-route', options), null)
  assert.equal(parseAppIntegrationRoute('#/month/2026-11', options), null)
  assert.equal(parseAppIntegrationRoute('#/challenge/light-path', options), null)
  assert.equal(parseAppIntegrationRoute('#/notebook\u0000', options), null)
  assert.equal(parseAppIntegrationRoute('#/notebook\n', options), null)
})

test('appIntegrationRoutes builds canonical route hashes', () => {
  assert.equal(buildNotebookRoute(), NOTEBOOK_ROUTE_HASH)
  assert.equal(buildSavedScriptureRoute(), SAVED_SCRIPTURE_ROUTE_HASH)
  assert.equal(buildLibraryRoute(), LIBRARY_ROUTE_HASH)
  assert.ok(NOTEBOOK_ROUTE_ALIASES.includes('#/notebook'))
  assert.ok(SAVED_SCRIPTURE_ROUTE_ALIASES.includes('#/saved-scripture'))
  assert.ok(LIBRARY_ROUTE_ALIASES.includes('#/library'))
})

test('isHubCardAnnouncementsEnabled honors explicit false override and links to field notebook flag', () => {
  // When notebook is enabled and no explicit false override exists, defaults to true
  assert.equal(isHubCardAnnouncementsEnabled(true), true)
  // When notebook is disabled and no explicit env var, defaults to false
  assert.equal(isHubCardAnnouncementsEnabled(false), false)
})
