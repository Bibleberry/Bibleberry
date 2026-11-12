import assert from 'node:assert/strict'
import test from 'node:test'
import type { NewsArticle } from '../../src/cms/reader/newsProvider.ts'
import {
  classifyNewsLink,
  filterNewsArticles,
  formatMonthPreviewHeading,
  formatNewsCategory,
  formatNewsDate,
  isAuthorizedInternalDestination,
  isExternalLink,
  parseAuthorizedNewsLink,
} from '../../src/components/news/newsModel.ts'

test('formatNewsDate formats ISO civil dates to month-name day, year without timezone shifts', () => {
  assert.equal(formatNewsDate('2026-11-12'), 'November 12, 2026')
  assert.equal(formatNewsDate('2027-01-01'), 'January 1, 2027')
  assert.equal(formatNewsDate('2098-02-28'), 'February 28, 2098')
  assert.equal(formatNewsDate('invalid-date'), 'invalid-date')
})

test('formatNewsCategory returns approved human labels for all categories', () => {
  assert.equal(formatNewsCategory('monthlyPreview'), 'Monthly Preview')
  assert.equal(formatNewsCategory('ministryUpdate'), 'Ministry Update')
  assert.equal(formatNewsCategory('announcement'), 'Announcement')
})

test('formatMonthPreviewHeading formats YYYY-MM to Month Year', () => {
  assert.equal(formatMonthPreviewHeading('2026-11'), 'November 2026')
  assert.equal(formatMonthPreviewHeading('2027-03'), 'March 2027')
  assert.equal(formatMonthPreviewHeading('invalid'), 'invalid')
})

test('isExternalLink distinguishes internal hash destinations from external URLs', () => {
  assert.equal(isExternalLink('#/month/2026-11'), false)
  assert.equal(isExternalLink('#/challenge/sample'), false)
  assert.equal(isExternalLink('#internal'), false)

  assert.equal(isExternalLink('https://example.com'), true)
  assert.equal(isExternalLink('http://example.com/page'), true)
  assert.equal(isExternalLink('//evil.com'), true)
  assert.equal(isExternalLink('mailto:test@example.com'), true)
  assert.equal(isExternalLink('javascript:alert(1)'), true)
})

test('classifyNewsLink and parseAuthorizedNewsLink strictly authorize only #/month/YYYY-MM and reject all other internal destinations', () => {
  // Authorized internal destinations
  assert.deepEqual(classifyNewsLink('#/month/2026-11'), {
    kind: 'authorizedMonth',
    monthId: '2026-11',
  })
  assert.deepEqual(classifyNewsLink('#/month/2027-03'), {
    kind: 'authorizedMonth',
    monthId: '2027-03',
  })
  assert.deepEqual(parseAuthorizedNewsLink('#/month/2026-11'), {
    kind: 'month',
    monthId: '2026-11',
  })

  // Regression: #/challenge/* must be classified as unauthorizedInternal
  const challengeLinks = [
    '#/challenge/the-true-vine',
    '#/challenge/abide-in-me',
    '#/challenge/2026-11-01',
    '#/challenge/',
  ]
  for (const href of challengeLinks) {
    const res = classifyNewsLink(href)
    assert.equal(res.kind, 'unauthorizedInternal', `Expected unauthorizedInternal for: ${href}`)
    assert.equal(parseAuthorizedNewsLink(href), null)
  }

  // Regression: #/developer must be classified as unauthorizedInternal
  assert.equal(classifyNewsLink('#/developer').kind, 'unauthorizedInternal')
  assert.equal(parseAuthorizedNewsLink('#/developer'), null)

  // Regression: hash-only links (#, #/, #section) must be classified as unauthorizedInternal
  const hashOnlyLinks = ['#', '#/', '#section', '#notes', '#jump']
  for (const href of hashOnlyLinks) {
    const res = classifyNewsLink(href)
    assert.equal(res.kind, 'unauthorizedInternal', `Expected unauthorizedInternal for: ${href}`)
    assert.equal(parseAuthorizedNewsLink(href), null)
  }

  // Regression: malformed month fragments must be classified as unauthorizedInternal
  const malformedMonthLinks = [
    '#/month',
    '#/month/',
    '#/month/2026',
    '#/month/2026-13', // invalid month 13
    '#/month/2026-00', // invalid month 00
    '#/month/2026-99',
    '#/month/2026-11-01', // day specified
    '#/month/2026-11/slot/1',
    '#/month/2026-11?origin=hub', // query attached
    '#/month/2026-11#anchor', // fragment attached
    '#/month/2026-11 ', // trailing space inside URL
  ]
  for (const href of malformedMonthLinks) {
    const res = classifyNewsLink(href)
    assert.equal(res.kind, 'unauthorizedInternal', `Expected unauthorizedInternal for malformed: ${href}`)
    assert.equal(parseAuthorizedNewsLink(href), null)
  }

  // External links
  assert.equal(classifyNewsLink('https://example.com').kind, 'external')
  assert.equal(classifyNewsLink('http://example.com').kind, 'external')
  assert.equal(classifyNewsLink('//evil.com').kind, 'external')

  // Backslashes or invalid input
  assert.equal(classifyNewsLink('#/month\\2026-11').kind, 'invalid')
  assert.equal(classifyNewsLink('').kind, 'invalid')
})

test('isAuthorizedInternalDestination validates month destinations strictly', () => {
  assert.equal(
    isAuthorizedInternalDestination({ kind: 'month', monthId: '2026-11' }),
    true,
  )
  assert.equal(
    isAuthorizedInternalDestination({ kind: 'month', monthId: '2027-03' }),
    true,
  )
  // @ts-expect-error test invalid kind
  assert.equal(isAuthorizedInternalDestination({ kind: 'challenge', slug: 'vine' }), false)
  // @ts-expect-error test invalid monthId
  assert.equal(isAuthorizedInternalDestination({ kind: 'month', monthId: '2026-13' }), false)
  assert.equal(isAuthorizedInternalDestination(undefined), false)
})

test('filterNewsArticles filters articles accurately by category', () => {
  const articles: readonly NewsArticle[] = [
    {
      id: 'a1',
      documentId: 'news-a1',
      category: 'ministryUpdate',
      publishedOn: '2026-11-10',
      title: 'Update 1',
      summary: 'Summary 1',
    },
    {
      id: 'a2',
      documentId: 'news-a2',
      category: 'announcement',
      publishedOn: '2026-11-11',
      title: 'Announcement 1',
      summary: 'Summary 2',
    },
    {
      id: 'a3',
      documentId: 'news-a3',
      category: 'monthlyPreview',
      publishedOn: '2026-11-12',
      title: 'Preview 1',
      summary: 'Summary 3',
      destination: { kind: 'month', monthId: '2026-12' },
    },
  ]

  assert.equal(filterNewsArticles(articles, 'all').length, 3)
  assert.equal(filterNewsArticles(articles, 'ministryUpdate').length, 1)
  assert.equal(filterNewsArticles(articles, 'ministryUpdate')[0]?.id, 'a1')
  assert.equal(filterNewsArticles(articles, 'announcement').length, 1)
  assert.equal(filterNewsArticles(articles, 'announcement')[0]?.id, 'a2')
  assert.equal(filterNewsArticles(articles, 'monthlyPreview').length, 1)
  assert.equal(filterNewsArticles(articles, 'monthlyPreview')[0]?.id, 'a3')
})

