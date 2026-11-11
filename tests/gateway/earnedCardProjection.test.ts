import assert from 'node:assert/strict'
import test from 'node:test'
import { handleGatewayRequest } from '../../src/gateway/handler.ts'
import { daysInMonth, formatCivilDate } from '../../src/gateway/localRelease.ts'
import {
  MONTHLY_DETAIL_BY_ID_GROQ_QUERY,
  MONTHLY_PREVIEW_BY_ID_GROQ_QUERY,
} from '../../src/gateway/query.ts'
import type {
  GatewayEarnedScriptureCard,
  GatewayEnv,
  GatewayFetch,
} from '../../src/gateway/types.ts'

const TEST_ENV: GatewayEnv = {
  SANITY_PROJECT_ID: '80016lrq',
  SANITY_DATASET: 'staging',
  SANITY_READ_TOKEN: 'test-reader-token-secret-12345',
  ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
}

function createMockFetch(
  handler: (url: URL, init?: RequestInit) => Response | Promise<Response>,
): GatewayFetch {
  return async (input, init) => {
    const url =
      typeof input === 'string'
        ? new URL(input)
        : input instanceof URL
          ? input
          : new URL(input.url)
    return handler(url, init)
  }
}

function makeChallengeForSlot(yearMonth: string, dayOfMonth: number) {
  const padded = String(dayOfMonth).padStart(2, '0')
  const id = `r14-2-stg-${yearMonth}-day-${padded}`
  return {
    _id: id,
    _type: 'challenge',
    title: `Day ${dayOfMonth} Title (${yearMonth})`,
    slug: `day-${padded}-${yearMonth}`,
    challengeType: 'teaching',
    withdrawn: false,
    editorialEligibility: {
      adaptationReviewed: true,
      reviewedAt: '2098-03-15T12:00:00.000Z',
    },
    unapprovedBlockCount: 0,
    primaryScripture: {
      reference: `Psalm 23:${(dayOfMonth % 6) + 1}`,
      translation: 'Not configured',
      textStatus: 'referenceOnly',
      usageRightsConfirmed: false,
      practiceStatus: 'notConfigured',
    },
    assignedMonthIds: [`month-${yearMonth}`],
  }
}

function makeSyntheticCardDoc(
  slug: string,
  cardCategory: 'monthlyThematic' | 'monthlyFull',
  yearMonth: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    _id: `card-${slug}`,
    _type: 'scriptureCard',
    title: `Synthetic Card Title (${slug})`,
    internalTitle: `INTERNAL_STUDIO_LABEL_${slug}`,
    slug,
    cardCategory,
    plannedYearMonth: yearMonth,
    assetRevision: 'v1',
    artwork: {
      url: `https://cdn.sanity.io/images/80016lrq/staging/synthetic-${slug}-1200x1600.png`,
    },
    illustrationAlt: `Synthetic visual alt description for ${slug}.`,
    accessibleTranscription: `Synthetic accessible Scripture transcription for ${slug}.`,
    scriptureCitation: {
      book: 'John',
      reference: 'John 15:1-5',
      translation: 'Not configured',
      usageRightsConfirmed: false,
    },
    theologicalThemes: ['Abiding', 'Fruitfulness'],
    keywords: ['john-15', 'synthetic-motif'],
    rightsAndAttribution: {
      attribution: 'Synthetic QA Fixture (Aaron Waid)',
      rightsStatus: 'Synthetic test asset only',
      usageRightsConfirmed: true,
    },
    shareEligible: true,
    editorialStatus: 'approved',
    withdrawn: false,
    editorialReview: {
      reviewedBy: 'Aaron Waid (technical synthetic approval)',
      reviewerRole: 'technical_synthetic',
      reviewedAt: '2098-03-15T14:00:00.000Z',
      reviewNotes: 'PRIVATE_CARD_REVIEW_NOTE_DO_NOT_LEAK',
    },
    ...overrides,
  }
}

function makeMonthWithLinkedCards(
  yearMonth = '2098-04',
  overrides: Record<string, unknown> = {},
) {
  const year = Number(yearMonth.slice(0, 4))
  const month = Number(yearMonth.slice(5, 7))
  const count = daysInMonth(year, month)

  const slots = Array.from({ length: count }, (_, index) => {
    const day = index + 1
    const padded = String(day).padStart(2, '0')
    const challenge = makeChallengeForSlot(yearMonth, day)
    return {
      _key: `day-${padded}`,
      dayOfMonth: day,
      date: formatCivilDate(year, month, day),
      slotStatus: 'scheduled',
      rawChallengeRef: challenge._id,
      challenge,
    }
  })

  const finalizedChallengeIds = slots.map(s => s.challenge._id)
  const shepherdCard = makeSyntheticCardDoc(`${yearMonth}-shepherd-theme`, 'monthlyThematic', yearMonth)
  const wisdomCard = makeSyntheticCardDoc(`${yearMonth}-wisdom-path`, 'monthlyThematic', yearMonth, {
    scriptureCitation: {
      book: 'Proverbs',
      reference: 'Proverbs 3:5-6',
      translation: 'WEBP',
      usageRightsConfirmed: true,
    },
    shareEligible: false,
  })
  const fullMonthCardDoc = makeSyntheticCardDoc(`${yearMonth}-full-month`, 'monthlyFull', yearMonth)

  return {
    _id: `month-${yearMonth}`,
    _type: 'monthlyPublication',
    yearMonth,
    year,
    month,
    title: `Theme for ${yearMonth}`,
    subtitle: `Subtitle for ${yearMonth}`,
    editorialStatus: 'scheduled',
    withdrawn: false,
    editorialReview: {
      reviewedBy: 'Aaron Waid (technical synthetic approval)',
      reviewerRole: 'technical_synthetic',
      reviewedAt: '2098-03-15T14:00:00.000Z',
    },
    introduction: {
      previewScreens: [
        {
          _key: 'intro-1',
          _type: 'introductionScreen',
          heading: `Coming in ${yearMonth}`,
          blocks: [{ _key: 'b1', _type: 'statementBlock', text: 'Preview screen.' }],
        },
      ],
      welcomeScreen: {
        _key: 'welcome',
        _type: 'introductionScreen',
        heading: `Welcome to ${yearMonth}`,
        blocks: [{ _key: 'w1', _type: 'statementBlock', text: 'Welcome screen.' }],
      },
    },
    slots,
    rosterFinalization: {
      isFinalized: true,
      rosterVersion: 1,
      finalizedAt: '2098-03-16T10:00:00.000Z',
      finalizedBy: 'Aaron Waid',
      finalizedChallengeIds,
    },
    discoveries: [
      {
        _key: 'shepherd-theme',
        discoverySlug: 'shepherd-theme',
        title: 'Shepherd Theme',
        qualifyingChallengeIds: [finalizedChallengeIds[0], finalizedChallengeIds[2]],
        rawCardRef: shepherdCard._id,
        card: shepherdCard,
      },
      {
        _key: 'wisdom-path',
        discoverySlug: 'wisdom-path',
        title: 'Wisdom Path',
        qualifyingChallengeIds: [finalizedChallengeIds[1]],
        rawCardRef: wisdomCard._id,
        card: wisdomCard,
      },
    ],
    fullMonthCard: {
      title: `Complete ${yearMonth}`,
      rawCardRef: fullMonthCardDoc._id,
      card: fullMonthCardDoc,
    },
    ...overrides,
  }
}

function assertNoCardLeakage(serialized: string, slugs: readonly string[]) {
  assert.equal(serialized.includes('cdn.sanity.io/images/80016lrq/staging/synthetic-'), false)
  assert.equal(serialized.includes('accessibleTranscription'), false)
  assert.equal(serialized.includes('illustrationAlt'), false)
  assert.equal(serialized.includes('earnedCard'), false)
  assert.equal(serialized.includes('qualifyingChallengeIds'), false)
  assert.equal(serialized.includes('rawCardRef'), false)
  assert.equal(serialized.includes('INTERNAL_STUDIO_LABEL_'), false)
  assert.equal(serialized.includes('PRIVATE_CARD_REVIEW_NOTE_DO_NOT_LEAK'), false)
  for (const slug of slugs) {
    assert.equal(serialized.includes(`card-${slug}`), false)
    assert.equal(serialized.includes(`Synthetic Card Title (${slug})`), false)
    assert.equal(serialized.includes(`Synthetic visual alt description for ${slug}`), false)
    assert.equal(serialized.includes(`Synthetic accessible Scripture transcription for ${slug}`), false)
  }
}

test('GROQ queries include linked card projection on monthly detail only and never on monthly preview', () => {
  assert.equal(MONTHLY_DETAIL_BY_ID_GROQ_QUERY.includes('"rawCardRef": card._ref'), true)
  assert.equal(MONTHLY_DETAIL_BY_ID_GROQ_QUERY.includes('"card": card->{'), true)
  assert.equal(MONTHLY_PREVIEW_BY_ID_GROQ_QUERY.includes('discoveries'), false)
  assert.equal(MONTHLY_PREVIEW_BY_ID_GROQ_QUERY.includes('fullMonthCard'), false)
  assert.equal(MONTHLY_PREVIEW_BY_ID_GROQ_QUERY.includes('card->'), false)
})

test('GET preview, GET detail, and unearned POST progress entries never expose Card IDs, URLs, alt text, transcriptions, or private fields', async () => {
  const apr2098 = makeMonthWithLinkedCards('2098-04')
  const mockFetch = createMockFetch(() =>
    new Response(JSON.stringify({ result: apr2098 }), { status: 200 }),
  )
  const slugs = ['2098-04-shepherd-theme', '2098-04-wisdom-path', '2098-04-full-month']

  // 1. Pre-preview (2098-03-27) -> 404 everywhere
  {
    const previewRes = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-04/preview', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow: () => new Date('2098-03-27T12:00:00Z'), fetchImpl: mockFetch },
    )
    assert.equal(previewRes.status, 404)
    assertNoCardLeakage(await previewRes.text(), slugs)
  }

  // 2. Advance preview (2098-03-28) -> preview 200 (no cards/discoveries), detail 404, progress 404
  {
    const getNow = () => new Date('2098-03-28T12:00:00Z')
    const previewRes = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-04/preview', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow, fetchImpl: mockFetch },
    )
    assert.equal(previewRes.status, 200)
    assertNoCardLeakage(await previewRes.text(), slugs)

    const detailRes = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-04', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow, fetchImpl: mockFetch },
    )
    assert.equal(detailRes.status, 404)
    assertNoCardLeakage(await detailRes.text(), slugs)

    const progressRes = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-04/progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bibleberry-Timezone': 'America/New_York',
        },
        body: JSON.stringify({ completedChallengeIds: ['cms:r14-2-stg-2098-04-day-02'] }),
      }),
      TEST_ENV,
      { getNow, fetchImpl: mockFetch },
    )
    assert.equal(progressRes.status, 404)
    assertNoCardLeakage(await progressRes.text(), slugs)
  }

  // 3. Active month GET detail (2098-04-05) -> 200, discovery titles/targets only, zero card data
  {
    const detailRes = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-04', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow: () => new Date('2098-04-05T12:00:00Z'), fetchImpl: mockFetch },
    )
    assert.equal(detailRes.status, 200)
    const detailText = await detailRes.text()
    assertNoCardLeakage(detailText, slugs)
  }

  // 4. POST progress with partial + repeated + future-slot + cross-month + guessed IDs -> zero leakage on unearned entries
  {
    const progressRes = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-04/progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bibleberry-Timezone': 'America/New_York',
        },
        body: JSON.stringify({
          completedChallengeIds: [
            'cms:r14-2-stg-2098-04-day-01', // partial shepherd-theme (1/2)
            'cms:r14-2-stg-2098-04-day-01', // duplicate must not amplify to 2/2
            'cms:r14-2-stg-2098-04-day-01',
            'cms:r14-2-stg-2098-04-day-03', // future on 2098-04-02 -> ignored!
            'cms:r14-2-stg-2098-03-day-02', // wrong month -> ignored!
            'cms:guessed-wisdom-id',
          ],
        }),
      }),
      TEST_ENV,
      { getNow: () => new Date('2098-04-02T12:00:00Z'), fetchImpl: mockFetch },
    )
    assert.equal(progressRes.status, 200)
    const text = await progressRes.text()
    assertNoCardLeakage(text, slugs)

    const body = JSON.parse(text) as {
      completedInMonthCount: number
      thematicEarnedCount: number
      discoveries: Array<{ achievedCount: number; targetCount: number; isEarned: boolean }>
    }
    assert.equal(body.completedInMonthCount, 1)
    assert.equal(body.thematicEarnedCount, 0)
    assert.equal(body.discoveries[0].achievedCount, 1)
    assert.equal(body.discoveries[0].targetCount, 2)
    assert.equal(body.discoveries.every(d => d.isEarned === false), true)
  }
})

test('POST /api/months/:yearMonth/progress projects earnedCard solely when discovery is earned and respects independent thresholds and full-month completion', async () => {
  const apr2098 = makeMonthWithLinkedCards('2098-04')
  const mockFetch = createMockFetch(() =>
    new Response(JSON.stringify({ result: apr2098 }), { status: 200 }),
  )

  // A. Earliest release date for wisdom-path (day-02 on 2098-04-02): earns wisdom-path ONLY
  {
    const res = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-04/progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bibleberry-Timezone': 'America/New_York',
        },
        body: JSON.stringify({
          completedChallengeIds: [
            'cms:r14-2-stg-2098-04-day-01', // 1/2 shepherd
            'cms:r14-2-stg-2098-04-day-02', // 1/1 wisdom -> EARNED
          ],
        }),
      }),
      TEST_ENV,
      { getNow: () => new Date('2098-04-02T12:00:00Z'), fetchImpl: mockFetch },
    )
    assert.equal(res.status, 200)
    const rawText = await res.text()
    assert.equal(rawText.includes('INTERNAL_STUDIO_LABEL_'), false)
    assert.equal(rawText.includes('PRIVATE_CARD_REVIEW_NOTE_DO_NOT_LEAK'), false)
    assert.equal(rawText.includes('qualifyingChallengeIds'), false)
    assert.equal(rawText.includes('card-2098-04-shepherd-theme'), false)
    assert.equal(rawText.includes('card-2098-04-full-month'), false)

    const body = JSON.parse(rawText) as {
      thematicEarnedCount: number
      discoveries: Array<{
        discoveryId: string
        isEarned: boolean
        awardId?: string
        earnedCard?: GatewayEarnedScriptureCard
      }>
    }
    assert.equal(body.thematicEarnedCount, 1)
    assert.equal(body.discoveries[0].isEarned, false)
    assert.equal(body.discoveries[0].earnedCard, undefined)
    assert.equal(body.discoveries[2].isEarned, false)
    assert.equal(body.discoveries[2].earnedCard, undefined)

    const wisdom = body.discoveries[1]
    assert.equal(wisdom.isEarned, true)
    assert.equal(wisdom.awardId, 'card:monthly:2098-04:wisdom-path')
    assert.deepEqual(wisdom.earnedCard, {
      cardDocumentId: 'card-2098-04-wisdom-path',
      title: 'Synthetic Card Title (2098-04-wisdom-path)',
      publicationYearMonth: '2098-04',
      imageUrl: 'https://cdn.sanity.io/images/80016lrq/staging/synthetic-2098-04-wisdom-path-1200x1600.png',
      assetRevision: 'v1',
      illustrationAlt: 'Synthetic visual alt description for 2098-04-wisdom-path.',
      accessibleTranscription: 'Synthetic accessible Scripture transcription for 2098-04-wisdom-path.',
      scripture: {
        book: 'Proverbs',
        reference: 'Proverbs 3:5-6',
        translation: 'WEBP',
      },
      attribution: 'Synthetic QA Fixture (Aaron Waid)',
      rightsStatus: 'Synthetic test asset only',
      shareEligible: false,
      theologicalThemes: ['Abiding', 'Fruitfulness'],
      keywords: ['john-15', 'synthetic-motif'],
    })
  }

  // B. Full-month completion after all active slots are released & completed (2098-05-02)
  {
    const allIds = (apr2098.rosterFinalization.finalizedChallengeIds as string[]).map(id => `cms:${id}`)
    const res = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-04/progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bibleberry-Timezone': 'America/New_York',
        },
        body: JSON.stringify({ completedChallengeIds: allIds }),
      }),
      TEST_ENV,
      { getNow: () => new Date('2098-05-02T12:00:00Z'), fetchImpl: mockFetch },
    )
    assert.equal(res.status, 200)
    const body = (await res.json()) as {
      completedInMonthCount: number
      totalChallenges: number
      thematicEarnedCount: number
      discoveries: Array<{
        kind: string
        isEarned: boolean
        awardId?: string
        earnedCard?: GatewayEarnedScriptureCard
      }>
    }
    assert.equal(body.completedInMonthCount, 30)
    assert.equal(body.totalChallenges, 30)
    assert.equal(body.thematicEarnedCount, 2)
    assert.equal(body.discoveries.every(d => d.isEarned && Boolean(d.earnedCard)), true)

    const fullMonth = body.discoveries[2]
    assert.equal(fullMonth.kind, 'fullMonth')
    assert.equal(fullMonth.awardId, 'card:monthly:2098-04:full-month')
    assert.equal(fullMonth.earnedCard?.cardDocumentId, 'card-2098-04-full-month')
    assert.equal(fullMonth.earnedCard?.publicationYearMonth, '2098-04')
  }
})

test('Option 4A emergency withdrawal and post-approval asset revision updates preserve earnedCard projection cleanly', async () => {
  // Withdrawn slot 18 under rosterVersion 2 (29/29 active) + updated assetRevision 'v2' on full-month card
  const doc = makeMonthWithLinkedCards('2098-04')
  doc.slots[17] = {
    ...doc.slots[17],
    slotStatus: 'withdrawn',
    challenge: null as unknown as ReturnType<typeof makeChallengeForSlot>,
  }
  doc.rosterFinalization = {
    isFinalized: true,
    rosterVersion: 2,
    finalizedAt: '2098-04-18T12:00:00.000Z',
    finalizedBy: 'Aaron Waid',
    finalizedChallengeIds: doc.slots
      .filter(s => s.slotStatus === 'scheduled')
      .map(s => s.challenge._id),
  }
  doc.fullMonthCard.card = makeSyntheticCardDoc('2098-04-full-month', 'monthlyFull', '2098-04', {
    assetRevision: 'v2',
    title: 'Revised Synthetic Full-Month Card',
  })

  const mockFetch = createMockFetch(() =>
    new Response(JSON.stringify({ result: doc }), { status: 200 }),
  )
  const activeIds = (doc.rosterFinalization.finalizedChallengeIds as string[]).map(id => `cms:${id}`)

  const res = await handleGatewayRequest(
    new Request('http://localhost/api/months/2098-04/progress', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bibleberry-Timezone': 'America/New_York',
      },
      body: JSON.stringify({ completedChallengeIds: activeIds }),
    }),
    TEST_ENV,
    { getNow: () => new Date('2098-05-02T12:00:00Z'), fetchImpl: mockFetch },
  )
  assert.equal(res.status, 200)
  const body = (await res.json()) as {
    rosterVersion: number
    completedInMonthCount: number
    totalChallenges: number
    discoveries: Array<{ awardId?: string; earnedCard?: GatewayEarnedScriptureCard }>
  }
  assert.equal(body.rosterVersion, 2)
  assert.equal(body.completedInMonthCount, 29)
  assert.equal(body.totalChallenges, 29)
  assert.equal(body.discoveries[2].awardId, 'card:monthly:2098-04:full-month')
  assert.equal(body.discoveries[2].earnedCard?.assetRevision, 'v2')
  assert.equal(body.discoveries[2].earnedCard?.title, 'Revised Synthetic Full-Month Card')
})

test('fails closed for invalid, draft, withdrawn, mislinked, unverified, or duplicate Cards while preserving month access and other valid discoveries', async () => {
  const baseCard = makeSyntheticCardDoc('2098-04-shepherd-theme', 'monthlyThematic', '2098-04')

  const invalidCardCases: Array<{
    label: string
    mutate: (doc: ReturnType<typeof makeMonthWithLinkedCards>) => void
  }> = [
    {
      label: 'draft editorialStatus',
      mutate: d => {
        d.discoveries[0].card = { ...baseCard, editorialStatus: 'draft' }
      },
    },
    {
      label: 'inReview editorialStatus',
      mutate: d => {
        d.discoveries[0].card = { ...baseCard, editorialStatus: 'inReview' }
      },
    },
    {
      label: 'withdrawn card',
      mutate: d => {
        d.discoveries[0].card = { ...baseCard, withdrawn: true }
      },
    },
    {
      label: 'draft-only / dangling weak ref (card is null)',
      mutate: d => {
        d.discoveries[0].card = null as unknown as Record<string, unknown>
      },
    },
    {
      label: 'drafts. prefix in rawCardRef',
      mutate: d => {
        d.discoveries[0].rawCardRef = 'drafts.card-2098-04-shepherd-theme'
      },
    },
    {
      label: 'drafts. prefix in card._id',
      mutate: d => {
        d.discoveries[0].card = { ...baseCard, _id: 'drafts.card-2098-04-shepherd-theme' }
      },
    },
    {
      label: 'malformed card._id (UUID)',
      mutate: d => {
        d.discoveries[0].rawCardRef = 'uuid-not-a-card'
        d.discoveries[0].card = { ...baseCard, _id: 'uuid-not-a-card' }
      },
    },
    {
      label: 'slug / _id mismatch',
      mutate: d => {
        d.discoveries[0].card = { ...baseCard, slug: 'different-slug' }
      },
    },
    {
      label: 'rawCardRef / card._id mismatch',
      mutate: d => {
        d.discoveries[0].rawCardRef = 'card-2098-04-other-ref'
      },
    },
    {
      label: 'wrong document _type',
      mutate: d => {
        d.discoveries[0].card = { ...baseCard, _type: 'challenge' }
      },
    },
    {
      label: 'missing editorialReview',
      mutate: d => {
        d.discoveries[0].card = { ...baseCard, editorialReview: {} }
      },
    },
    {
      label: 'wrong cardCategory on thematic discovery (monthlyFull)',
      mutate: d => {
        d.discoveries[0].card = { ...baseCard, cardCategory: 'monthlyFull' }
      },
    },
    {
      label: 'wrong cardCategory on thematic discovery (foundation)',
      mutate: d => {
        d.discoveries[0].card = { ...baseCard, cardCategory: 'foundation' }
      },
    },
    {
      label: 'mismatched plannedYearMonth',
      mutate: d => {
        d.discoveries[0].card = { ...baseCard, plannedYearMonth: '2098-05' }
      },
    },
    {
      label: 'non-HTTPS artwork URL',
      mutate: d => {
        d.discoveries[0].card = {
          ...baseCard,
          artwork: { url: 'http://cdn.sanity.io/images/80016lrq/staging/synthetic-card.png' },
        }
      },
    },
    {
      label: 'unvalidated external artwork URL',
      mutate: d => {
        d.discoveries[0].card = {
          ...baseCard,
          artwork: { url: 'https://evil.example.com/images/80016lrq/staging/card.png' },
        }
      },
    },
    {
      label: 'wrong Sanity project/dataset in artwork URL',
      mutate: d => {
        d.discoveries[0].card = {
          ...baseCard,
          artwork: { url: 'https://cdn.sanity.io/images/80016lrq/production/synthetic-card.png' },
        }
      },
    },
    {
      label: 'artwork URL with query string',
      mutate: d => {
        d.discoveries[0].card = {
          ...baseCard,
          artwork: { url: 'https://cdn.sanity.io/images/80016lrq/staging/synthetic-card.png?token=1' },
        }
      },
    },
    {
      label: 'missing artwork',
      mutate: d => {
        d.discoveries[0].card = { ...baseCard, artwork: null }
      },
    },
    {
      label: 'missing illustrationAlt',
      mutate: d => {
        d.discoveries[0].card = { ...baseCard, illustrationAlt: '   ' }
      },
    },
    {
      label: 'missing accessibleTranscription',
      mutate: d => {
        d.discoveries[0].card = { ...baseCard, accessibleTranscription: '' }
      },
    },
    {
      label: 'identical illustrationAlt and accessibleTranscription',
      mutate: d => {
        d.discoveries[0].card = {
          ...baseCard,
          illustrationAlt: 'Same string.',
          accessibleTranscription: 'same string.',
        }
      },
    },
    {
      label: 'unconfirmed artwork rights',
      mutate: d => {
        d.discoveries[0].card = {
          ...baseCard,
          rightsAndAttribution: {
            attribution: 'Synthetic QA',
            rightsStatus: 'Unverified',
            usageRightsConfirmed: false,
          },
        }
      },
    },
    {
      label: 'unconfirmed Scripture translation rights for WEBP',
      mutate: d => {
        d.discoveries[0].card = {
          ...baseCard,
          scriptureCitation: {
            book: 'John',
            reference: 'John 15:1-5',
            translation: 'WEBP',
            usageRightsConfirmed: false,
          },
        }
      },
    },
    {
      label: 'conflict between linked card._id and legacy reservedCardId',
      mutate: d => {
        ;(d.discoveries[0] as Record<string, unknown>).reservedCardId = 'card-2098-04-different'
      },
    },
  ]

  for (const { label, mutate } of invalidCardCases) {
    const doc = makeMonthWithLinkedCards('2098-04')
    mutate(doc)
    const mockFetch = createMockFetch(() =>
      new Response(JSON.stringify({ result: doc }), { status: 200 }),
    )
    const getNow = () => new Date('2098-04-05T12:00:00Z')

    // Unrelated month detail remains accessible without leaking invalid card
    const detailRes = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-04', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow, fetchImpl: mockFetch },
    )
    assert.equal(detailRes.status, 200, `Month detail should remain 200 for ${label}`)

    // Even when qualifying Challenges are completed, invalid discovery card fails closed (earnedCard omitted),
    // while sibling valid discovery (wisdom-path) continues returning its valid earnedCard!
    const progressRes = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-04/progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bibleberry-Timezone': 'America/New_York',
        },
        body: JSON.stringify({
          completedChallengeIds: [
            'cms:r14-2-stg-2098-04-day-01',
            'cms:r14-2-stg-2098-04-day-02',
            'cms:r14-2-stg-2098-04-day-03',
          ],
        }),
      }),
      TEST_ENV,
      { getNow, fetchImpl: mockFetch },
    )
    assert.equal(progressRes.status, 200, `Month progress should remain 200 for ${label}`)
    const progressText = await progressRes.text()
    assert.equal(
      progressText.includes('2098-04-shepherd-theme'),
      false,
      `Invalid card (${label}) must not leak cardDocumentId or URLs`,
    )
    const progressBody = JSON.parse(progressText) as {
      discoveries: Array<{ isEarned: boolean; earnedCard?: GatewayEarnedScriptureCard }>
    }
    assert.equal(progressBody.discoveries[0].isEarned, true)
    assert.equal(progressBody.discoveries[0].earnedCard, undefined, `Expected earnedCard omitted for ${label}`)
    assert.equal(progressBody.discoveries[1].isEarned, true)
    assert.equal(progressBody.discoveries[1].earnedCard?.cardDocumentId, 'card-2098-04-wisdom-path')
  }

  // Wrong cardCategory on fullMonthCard + intra-month duplicate card both fail closed
  {
    const doc = makeMonthWithLinkedCards('2098-04')
    doc.fullMonthCard.card = makeSyntheticCardDoc('2098-04-full-month', 'monthlyThematic', '2098-04')
    const dupCard = makeSyntheticCardDoc('2098-04-shepherd-theme', 'monthlyThematic', '2098-04')
    doc.discoveries[1].rawCardRef = dupCard._id
    doc.discoveries[1].card = dupCard

    const mockFetch = createMockFetch(() =>
      new Response(JSON.stringify({ result: doc }), { status: 200 }),
    )
    const allIds = (doc.rosterFinalization.finalizedChallengeIds as string[]).map(id => `cms:${id}`)
    const res = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-04/progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bibleberry-Timezone': 'America/New_York',
        },
        body: JSON.stringify({ completedChallengeIds: allIds }),
      }),
      TEST_ENV,
      { getNow: () => new Date('2098-05-02T12:00:00Z'), fetchImpl: mockFetch },
    )
    assert.equal(res.status, 200)
    const body = (await res.json()) as {
      discoveries: Array<{ earnedCard?: GatewayEarnedScriptureCard }>
    }
    assert.equal(body.discoveries[0].earnedCard, undefined)
    assert.equal(body.discoveries[1].earnedCard, undefined)
    assert.equal(body.discoveries[2].earnedCard, undefined)
  }
})
