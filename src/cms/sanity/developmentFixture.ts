const paragraph = (key: string, text: string, style = 'normal') => ({
  _key: key,
  _type: 'block',
  style,
  markDefs: [],
  children: [{ _key: `${key}-span`, _type: 'span', marks: [], text }],
})

const referenceOnlyScripture = {
  reference: 'Fixture Reference 1:1',
  translation: 'Not configured',
  textStatus: 'referenceOnly',
  usageRightsConfirmed: false,
  practiceStatus: 'notConfigured',
}

/** Structural development data only. It is not live, devotional, editorial, or Alexis-approved content. */
export const validChallengeFixture = {
  _id: 'fixture-challenge-document',
  _type: 'challenge',
  title: 'Structural Adapter Fixture',
  slug: 'structural-adapter-fixture',
  challengeType: 'teaching',
  series: {
    _id: 'fixture-series-document',
    title: 'Fixture Series',
    slug: 'fixture-series',
  },
  sequence: 2,
  releaseAt: '2026-11-02T09:00:00-05:00',
  summary: 'Development-only structural fixture for verifying the CMS renderer.',
  primaryScripture: referenceOnlyScripture,
  screens: [
    {
      _key: 'screen-encounter',
      _type: 'challengeScreen',
      screenLabel: 'Encounter',
      heading: 'Fixture screen one',
      blocks: [
        {
          _key: 'block-scripture',
          _type: 'scriptureBlock',
          scripture: referenceOnlyScripture,
        },
        {
          _key: 'block-rich-text',
          _type: 'richTextBlock',
          body: [
            paragraph('rich-paragraph', 'Fixture paragraph.'),
            {
              _key: 'rich-heading',
              _type: 'block',
              style: 'h2',
              markDefs: [],
              children: [{ _key: 'rich-heading-span', _type: 'span', marks: ['strong'], text: 'Fixture heading' }],
            },
            {
              _key: 'rich-list',
              _type: 'block',
              style: 'normal',
              listItem: 'bullet',
              level: 1,
              markDefs: [{ _key: 'fixture-link', _type: 'link', href: 'https://example.com/fixture' }],
              children: [{ _key: 'rich-list-span', _type: 'span', marks: ['em', 'fixture-link'], text: 'Fixture linked list item' }],
            },
            {
              ...paragraph('rich-list-nested', 'Fixture nested bullet item.'),
              listItem: 'bullet',
              level: 2,
            },
            {
              ...paragraph('rich-number', 'Fixture numbered item.'),
              listItem: 'number',
              level: 1,
            },
            paragraph('rich-subheading', 'Fixture subheading', 'h3'),
            paragraph('rich-quote', 'Fixture blockquote.', 'blockquote'),
          ],
        },
        {
          _key: 'block-statement',
          _type: 'statementBlock',
          text: 'Fixture statement.',
          label: 'Fixture label',
        },
        {
          _key: 'block-comparison',
          _type: 'comparisonBlock',
          left: { title: 'Fixture left', body: [paragraph('comparison-left', 'Left fixture body.')] },
          right: { title: 'Fixture right', body: [paragraph('comparison-right', 'Right fixture body.')] },
          footer: 'Fixture comparison footer.',
          reviewStatus: 'approved',
        },
        {
          _key: 'block-cards',
          _type: 'visualCardsBlock',
          cards: [
            { _key: 'card-one', _type: 'visualCard', title: 'Fixture card one', body: 'Fixture card body.' },
            { _key: 'card-two', _type: 'visualCard', title: 'Fixture card two' },
          ],
          reviewStatus: 'approved',
        },
      ],
    },
    {
      _key: 'screen-response',
      _type: 'challengeScreen',
      screenLabel: 'Respond',
      heading: 'Fixture screen two',
      blocks: [
        {
          _key: 'block-sequence',
          _type: 'connectedSequenceBlock',
          steps: [
            { _key: 'step-one', _type: 'sequenceStep', title: 'Fixture step one', body: 'First fixture step.' },
            { _key: 'step-two', _type: 'sequenceStep', title: 'Fixture step two', body: 'Second fixture step.' },
          ],
          cycle: true,
          returnCaption: 'Fixture return caption.',
          conclusion: 'Fixture sequence conclusion.',
          reviewStatus: 'approved',
        },
        {
          _key: 'block-reflection',
          _type: 'reflectionBlock',
          question: 'Fixture reflection question?',
          choices: [
            { _key: 'choice-one', _type: 'reflectionChoice', label: 'Fixture choice one', prompt: 'Fixture prompt one.' },
            { _key: 'choice-two', _type: 'reflectionChoice', label: 'Fixture choice two', prompt: 'Fixture prompt two.' },
          ],
          closing: 'Fixture reflection closing.',
          reviewStatus: 'approved',
        },
        {
          _key: 'block-study',
          _type: 'optionalStudyBlock',
          title: 'Fixture optional study',
          body: [paragraph('study-paragraph', 'Fixture optional-study body.')],
          scriptures: [{
            ...referenceOnlyScripture,
            _key: 'study-scripture',
            _type: 'scriptureReference',
            reference: 'Fixture Reference 2:2',
          }],
          reviewStatus: 'approved',
        },
        {
          _key: 'block-prayer',
          _type: 'prayerBlock',
          paragraphs: ['Fixture prayer paragraph one.', 'Fixture prayer paragraph two.'],
        },
      ],
    },
  ],
  companionLinks: [
    {
      _key: 'companion-one',
      _type: 'companionLink',
      provider: 'podcast',
      label: 'Fixture companion',
      description: 'Development-only companion metadata.',
      url: 'https://example.com/companion',
      availability: 'Fixture availability.',
    },
  ],
  editorialEligibility: {
    adaptationReviewed: true,
    reviewedAt: '2026-11-01T15:00:00Z',
  },
  editorialReview: {
    sourceTitle: 'This unprojected field must not reach the adapted result.',
    reviewNotes: 'Development-only sentinel for projection exclusion.',
  },
}
