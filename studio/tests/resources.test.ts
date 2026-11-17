// @ts-nocheck -- Sanity exec runs this Node test file; Studio's browser tsconfig has no Node test types.
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {validateDocument} from '@sanity/validation'
import {createSchema} from 'sanity'
import {createStructureBuilder} from 'sanity/structure'
import {schemaTypes} from '../schemaTypes/index'
import {structure} from '../structure'
import {initialValueTemplates} from '../initialValues/templates'

type ValidationOptions = Parameters<typeof validateDocument>[0]
type ValidationDocument = ValidationOptions['document']
type ValidationClient = Extract<ValidationOptions, {client: unknown}>['client']

const schema = createSchema({name: 'resources-test', types: schemaTypes})

const noNetworkClient = {
  fetch: async () => [],
  getDataUrl: () => {
    throw new Error('Unexpected Sanity network request')
  },
  request: async () => {
    throw new Error('Unexpected Sanity network request')
  },
  observable: {
    fetch: () => {
      throw new Error('Unexpected Sanity network fetch')
    },
  },
  withConfig() {
    return this
  },
} as unknown as ValidationClient

const throwingClient = {
  fetch: async () => {
    throw new Error('Simulated network failure')
  },
  getDataUrl: () => {
    throw new Error('Unexpected Sanity network request')
  },
  request: async () => {
    throw new Error('Unexpected Sanity network request')
  },
  observable: {
    fetch: () => {
      throw new Error('Unexpected Sanity network fetch')
    },
  },
  withConfig() {
    return this
  },
} as unknown as ValidationClient

type MockResourceRow = {
  _id: string
  editorialStatus?: string
  withdrawn?: boolean
}

function createPublishedResourceClient(
  publishedResources: MockResourceRow[],
  onFetch?: (info: {perspective: string; query: string}) => void,
): ValidationClient {
  function makeScopedClient(perspective: string): ValidationClient {
    return {
      fetch: async (query: string, params?: {ids?: string[]}) => {
        if (query.includes('_type == "ministryResource"')) {
          onFetch?.({perspective, query})
          if (perspective !== 'published') {
            throw new Error(`Expected perspective "published", received "${perspective}"`)
          }
          const ids = Array.isArray(params?.ids) ? params.ids : []
          return publishedResources.filter(r => ids.includes(r._id))
        }
        return []
      },
      getDataUrl: () => '',
      request: async () => [],
      observable: {
        fetch: () => {
          throw new Error('Unexpected observable fetch')
        },
      },
      withConfig(cfg?: {perspective?: string}) {
        return makeScopedClient(cfg?.perspective ?? perspective)
      },
    } as unknown as ValidationClient
  }

  return makeScopedClient('previewDrafts')
}

function markerPaths(result: Awaited<ReturnType<typeof validateDocument>>) {
  return result.markers.map(m => m.path.join('.'))
}

function makeValidExternalResource(overrides: Record<string, unknown> = {}): ValidationDocument {
  return {
    _id: 'resource-psalms-guide',
    _type: 'ministryResource',
    _rev: 'rev-1',
    _createdAt: '2026-11-16T08:00:00Z',
    _updatedAt: '2026-11-16T08:00:00Z',
    title: 'Psalms Reading Guide',
    slug: {_type: 'slug', current: 'psalms-reading-guide'},
    description: 'An introductory guide for praying and reading through the Psalms.',
    resourceKind: 'externalLink',
    externalUrl: 'https://example.org/resources/psalms-guide',
    presentationMode: 'inApp',
    destinationApproved: true,
    lastCheckedAt: '2026-11-16T08:00:00Z',
    accessibility: {
      summary: 'Accessible HTML article with semantic headings.',
    },
    rightsAndAttribution: {
      attribution: 'Synthetic QA Fixture (Aaron Waid)',
      rightsStatus: 'Synthetic test placeholder only',
      usageRightsConfirmed: true,
    },
    keywords: ['psalms', 'prayer'],
    editorialStatus: 'approved',
    withdrawn: false,
    editorialReview: {
      _type: 'monthlyEditorialReview',
      reviewedBy: 'Aaron Waid (synthetic QA)',
      reviewerRole: 'technical_synthetic',
      reviewedAt: '2026-11-16T08:00:00Z',
    },
    ...overrides,
  } as ValidationDocument
}

function makeValidDownloadResource(overrides: Record<string, unknown> = {}): ValidationDocument {
  return {
    _id: 'resource-study-pdf',
    _type: 'ministryResource',
    _rev: 'rev-1',
    _createdAt: '2026-11-16T08:00:00Z',
    _updatedAt: '2026-11-16T08:00:00Z',
    title: 'Printable Study Companion',
    slug: {_type: 'slug', current: 'printable-study-companion'},
    description: 'Downloadable PDF companion for group or personal study.',
    resourceKind: 'downloadableFile',
    downloadFile: {
      _type: 'file',
      asset: {_type: 'reference', _ref: 'file-synthetic123-pdf'},
    },
    presentationMode: 'download',
    destinationApproved: true,
    accessibility: {
      summary: 'Tagged PDF with selectable text.',
    },
    rightsAndAttribution: {
      attribution: 'Synthetic QA Fixture (Aaron Waid)',
      rightsStatus: 'Synthetic test placeholder only',
      usageRightsConfirmed: true,
    },
    editorialStatus: 'approved',
    withdrawn: false,
    editorialReview: {
      _type: 'monthlyEditorialReview',
      reviewedBy: 'Aaron Waid (synthetic QA)',
      reviewerRole: 'technical_synthetic',
      reviewedAt: '2026-11-16T08:00:00Z',
    },
    ...overrides,
  } as ValidationDocument
}

function makeValidSection(overrides: Record<string, unknown> = {}): ValidationDocument {
  return {
    _id: 'resource-section-study-guides',
    _type: 'resourceSection',
    _rev: 'rev-1',
    _createdAt: '2026-11-16T08:00:00Z',
    _updatedAt: '2026-11-16T08:00:00Z',
    title: 'Study Guides',
    slug: {_type: 'slug', current: 'study-guides'},
    description: 'Curated guides for deeper engagement with Scripture.',
    sortOrder: 1,
    resources: [
      {_type: 'reference', _key: 'res-1', _ref: 'resource-psalms-guide', _weak: true},
      {_type: 'reference', _key: 'res-2', _ref: 'resource-study-pdf', _weak: true},
    ],
    editorialStatus: 'approved',
    withdrawn: false,
    editorialReview: {
      _type: 'monthlyEditorialReview',
      reviewedBy: 'Aaron Waid (synthetic QA)',
      reviewerRole: 'technical_synthetic',
      reviewedAt: '2026-11-16T08:00:00Z',
    },
    ...overrides,
  } as ValidationDocument
}

function validateDoc(document: ValidationDocument, client: ValidationClient = noNetworkClient) {
  return validateDocument({
    document,
    schema,
    client,
    getDocumentExists: async () => true,
  })
}

test('ministryResource accepts valid approved externalLink and downloadableFile documents, plus draft and withdrawn states', async () => {
  const externalRes = await validateDoc(makeValidExternalResource())
  assert.deepEqual(externalRes.markers, [])

  const downloadRes = await validateDoc(makeValidDownloadResource())
  assert.deepEqual(downloadRes.markers, [])

  const draftRes = await validateDoc(
    makeValidExternalResource({
      editorialStatus: 'draft',
      destinationApproved: false,
      accessibility: {},
      rightsAndAttribution: {
        attribution: 'Draft author',
        rightsStatus: 'Pending confirmation',
        usageRightsConfirmed: false,
      },
      editorialReview: undefined,
    }),
  )
  assert.deepEqual(draftRes.markers, [])

  const withdrawnRes = await validateDoc(makeValidExternalResource({withdrawn: true}))
  assert.deepEqual(withdrawnRes.markers, [])
})

test('ministryResource rejects unsafe or invalid link schemes', async () => {
  const unsafeUrls = [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'ftp://example.org/file.pdf',
    'mailto:reader@example.org',
    '/relative/path/guide.pdf',
    'not-a-url',
  ]

  for (const badUrl of unsafeUrls) {
    const res = await validateDoc(makeValidExternalResource({externalUrl: badUrl}))
    assert.ok(
      markerPaths(res).includes('externalUrl'),
      `Expected externalUrl validation error for "${badUrl}", got: ${JSON.stringify(res.markers)}`,
    )
  }
})

test('ministryResource rejects missing/invalid fields, destination mismatches, and duplicate keywords', async () => {
  const missingFields = await validateDoc(
    makeValidExternalResource({
      title: '   ',
      description: '',
      slug: {_type: 'slug', current: 'Invalid Slug!'},
      externalUrl: '',
      presentationMode: 'download',
      keywords: ['psalms', 'Psalms'],
      lastCheckedAt: 'not-a-date',
    }),
  )
  const paths = markerPaths(missingFields)
  assert.ok(paths.includes('title'))
  assert.ok(paths.includes('description'))
  assert.ok(paths.includes('slug'))
  assert.ok(paths.includes('externalUrl'))
  assert.ok(paths.includes('presentationMode'))
  assert.ok(paths.includes('keywords'))
  assert.ok(paths.includes('lastCheckedAt'))

  const missingDownloadFile = await validateDoc(
    makeValidDownloadResource({
      downloadFile: undefined,
      externalUrl: 'https://example.org/should-not-be-here',
      presentationMode: 'external',
    }),
  )
  const dlPaths = markerPaths(missingDownloadFile)
  assert.ok(dlPaths.includes('downloadFile'))
  assert.ok(dlPaths.includes('externalUrl'))
  assert.ok(dlPaths.includes('presentationMode'))
})

test('ministryResource enforces accessibility metadata, source rights, and truthful review/withdrawal gates', async () => {
  const missingImageAlt = await validateDoc(
    makeValidExternalResource({
      accessibility: {
        summary: 'Accessible article.',
        coverImage: {
          _type: 'image',
          asset: {_type: 'reference', _ref: 'image-synthetic123-800x600-png'},
        },
      },
    }),
  )
  assert.ok(markerPaths(missingImageAlt).includes('accessibility.coverImage.alt'))

  const unapprovedGates = await validateDoc(
    makeValidExternalResource({
      destinationApproved: false,
      accessibility: {summary: '  '},
      rightsAndAttribution: {
        attribution: 'Synthetic QA',
        rightsStatus: 'Synthetic',
        usageRightsConfirmed: false,
      },
      editorialReview: {
        reviewedBy: '',
        reviewerRole: 'invalid_role',
        reviewedAt: 'invalid-date',
      },
    }),
  )
  const gatePaths = markerPaths(unapprovedGates)
  assert.ok(gatePaths.includes('destinationApproved'))
  assert.ok(gatePaths.includes('accessibility.summary'))
  assert.ok(gatePaths.includes('rightsAndAttribution.usageRightsConfirmed'))
  assert.ok(gatePaths.includes('editorialReview.reviewedBy'))
  assert.ok(gatePaths.includes('editorialReview.reviewerRole'))
  assert.ok(gatePaths.includes('editorialReview.reviewedAt'))

  const invalidStatus = await validateDoc(
    makeValidExternalResource({editorialStatus: 'published'}),
  )
  assert.ok(markerPaths(invalidStatus).includes('editorialStatus'))
})

test('resourceSection accepts valid approved sections and verifies published resources with perspective: "published"', async () => {
  let seenPerspective = ''
  const client = createPublishedResourceClient(
    [
      {_id: 'resource-psalms-guide', editorialStatus: 'approved', withdrawn: false},
      {_id: 'resource-study-pdf', editorialStatus: 'approved', withdrawn: false},
    ],
    ({perspective}) => {
      seenPerspective = perspective
    },
  )

  const res = await validateDoc(makeValidSection(), client)
  assert.deepEqual(res.markers, [])
  assert.equal(seenPerspective, 'published')
})

test('resourceSection rejects missing/invalid fields, invalid sortOrder, and duplicate resource relationships', async () => {
  const client = createPublishedResourceClient([
    {_id: 'resource-psalms-guide', editorialStatus: 'approved', withdrawn: false},
  ])

  const invalidSection = await validateDoc(
    makeValidSection({
      title: '',
      description: '   ',
      slug: {_type: 'slug', current: 'Bad_Slug'},
      sortOrder: 0,
      resources: [
        {_type: 'reference', _key: 'r1', _ref: 'resource-psalms-guide', _weak: true},
        {_type: 'reference', _key: 'r2', _ref: 'drafts.resource-psalms-guide', _weak: true},
      ],
      editorialReview: undefined,
    }),
    client,
  )

  const paths = markerPaths(invalidSection)
  assert.ok(paths.includes('title'))
  assert.ok(paths.includes('description'))
  assert.ok(paths.includes('slug'))
  assert.ok(paths.includes('sortOrder'))
  assert.ok(paths.includes('resources.1'))
  assert.ok(paths.includes('editorialReview.reviewedBy'))
  assert.ok(paths.includes('editorialReview.reviewerRole'))
  assert.ok(paths.includes('editorialReview.reviewedAt'))
})

test('resourceSection fails closed on draft, unpublished, unapproved, withdrawn, or unreachable resources', async () => {
  const client = createPublishedResourceClient([
    {_id: 'resource-in-review', editorialStatus: 'inReview', withdrawn: false},
    {_id: 'resource-withdrawn', editorialStatus: 'approved', withdrawn: true},
  ])

  const badRefs = await validateDoc(
    makeValidSection({
      resources: [
        {_type: 'reference', _key: 'r1', _ref: 'resource-missing', _weak: true},
        {_type: 'reference', _key: 'r2', _ref: 'resource-in-review', _weak: true},
        {_type: 'reference', _key: 'r3', _ref: 'resource-withdrawn', _weak: true},
      ],
    }),
    client,
  )
  const paths = markerPaths(badRefs)
  assert.ok(paths.includes('resources.0'))
  assert.ok(paths.includes('resources.1'))
  assert.ok(paths.includes('resources.2'))

  const emptyApproved = await validateDoc(makeValidSection({resources: []}), client)
  assert.ok(markerPaths(emptyApproved).includes('resources'))

  const networkError = await validateDoc(makeValidSection(), throwingClient)
  assert.ok(markerPaths(networkError).includes('resources'))
})

test('Studio Structure registers the Resources workspace for resourceSection and ministryResource', () => {
  const mockSource = {
    schema,
    templates: initialValueTemplates,
    i18n: {t: (key: string) => key},
    document: {
      resolveProductionUrl: undefined,
      resolveNewDocumentOptions: () => [],
      actions: [],
      badges: [],
      unstable_languageFilter: [],
      newDocumentOptions: (prev: unknown[]) => prev,
    },
  } as unknown as Parameters<typeof createStructureBuilder>[0]['source']

  const S = createStructureBuilder({
    source: mockSource,
    perspectiveStack: ['drafts'],
  })
  const rootBuilder = structure(S, {} as never) as {serialize?: () => {items?: Array<{id?: string; title?: string}>}}
  const root = rootBuilder.serialize?.() ?? {items: []}
  const resourcesItem = root.items?.find(item => item.id === 'ministry-resources-workspace')
  assert.ok(resourcesItem, 'Expected ministry-resources-workspace in Studio structure')
  assert.equal(resourcesItem?.title, 'Resources')
})
