export const SERIES_DOCUMENT_ID = '26-day-biblical-gratitude-challenge'
export const NOV2_DOCUMENT_ID = '2026-11-02-rejoice-always'
export const NOV2_TEMPLATE_ID = 'nov-2-rejoice-always'
export const SERIES_TEMPLATE_ID = 'gratitude-series-pilot'

const primaryScripture = {
  _type: 'scriptureReference',
  reference: '1 Thessalonians 5:16–18',
  translation: 'NIV',
  textStatus: 'referenceOnly',
  usageRightsConfirmed: false,
  practiceStatus: 'notConfigured',
}

const referenceOnly = (reference: string) => ({
  _type: 'scriptureReference',
  reference,
  translation: 'Not configured',
  textStatus: 'referenceOnly',
  usageRightsConfirmed: false,
  practiceStatus: 'notConfigured',
})

const portableParagraph = (key: string, text: string) => ({
  _key: key,
  _type: 'block',
  style: 'normal',
  markDefs: [],
  children: [{_key: `${key}-span`, _type: 'span', marks: [], text}],
})

const richText = (key: string, paragraphs: string[]) => ({
  _key: key,
  _type: 'richTextBlock',
  body: paragraphs.map((text, index) => portableParagraph(`${key}-p${index + 1}`, text)),
})

const statement = (key: string, text: string) => ({
  _key: key,
  _type: 'statementBlock',
  label: 'Alexis’s teaching',
  text,
})

const scriptureBlock = (key: string) => ({
  _key: key,
  _type: 'scriptureBlock',
  scripture: primaryScripture,
})

const optionalStudy = (key: string, title: string, paragraphs: string[], references: string[] = []) => ({
  _key: key,
  _type: 'optionalStudyBlock',
  title,
  body: paragraphs.map((text, index) => portableParagraph(`${key}-p${index + 1}`, text)),
  scriptures: references.map((reference, index) => ({_key: `${key}-reference-${index + 1}`, ...referenceOnly(reference)})),
  reviewStatus: 'proposed',
})

export const nov2InitialValue = {
  _type: 'challenge',
  title: 'Rejoice Always',
  slug: {_type: 'slug', current: NOV2_DOCUMENT_ID},
  challengeType: 'teaching',
  series: {_type: 'reference', _ref: SERIES_DOCUMENT_ID, _weak: true},
  sequence: 2,
  primaryScripture,
  screens: [
    {
      _key: 'b1',
      _type: 'challengeScreen',
      screenLabel: 'Encounter',
      heading: 'Rejoice always. But how?',
      blocks: [
        scriptureBlock('b1-scripture'),
        richText('b1-text', [
          'Well, how is someone supposed to do that?',
          'Joy often feels spontaneous, right? It can come unexpectedly, or we can anticipate it with things like holidays, spending time with friends, or doing something we really enjoy.',
          'But Paul doesn’t command us to feel joy always. He commands us to rejoice always. And there’s a difference.',
        ]),
      ],
    },
    {
      _key: 'b2',
      _type: 'challengeScreen',
      screenLabel: 'Distinguish',
      heading: 'Feeling joyful is not the same as rejoicing',
      blocks: [
        {
          _key: 'b2-contrast',
          _type: 'comparisonBlock',
          left: {
            _type: 'comparisonSide',
            title: 'Feeling joy',
            body: [portableParagraph('b2-left-p1', 'An emotion that can arise unexpectedly or in anticipated enjoyable experiences.')],
          },
          right: {
            _type: 'comparisonSide',
            title: 'Choosing to rejoice',
            body: [portableParagraph('b2-right-p1', 'Rejoicing isn’t dependent on feeling joyful. It’s a position of the heart and mind. It’s choosing to recognize God’s goodness even when our circumstances are difficult or far from ideal.')],
          },
          footer: 'It’s remembering that God is good even when life isn’t going well. And when things are going well, it’s recognizing that God is the source of everything we have.',
          reviewStatus: 'proposed',
        },
      ],
    },
    {
      _key: 'b3',
      _type: 'challengeScreen',
      screenLabel: 'Clarify',
      heading: 'Rejoicing isn’t pretending',
      blocks: [
        richText('b3-text', [
          'But rejoicing also isn’t putting on rose-colored glasses and pretending everything is wonderful just so we can say we’re following Paul’s command.',
          'God doesn’t ask us to pretend that everything is fine. In fact, Scripture gives us countless examples of people who experienced tremendous suffering, grief, and disappointment. We even see Jesus Himself weeping.',
        ]),
        statement('b3-statement', 'So how can we rejoice in a world filled with so much pain and difficulty?'),
        optionalStudy(
          'b3-john',
          'Explore Jesus and human grief — John 11:33–35',
          ['In John 11, Jesus encounters the grief surrounding Lazarus\'s death. He is deeply moved and weeps. His example is important here: Christian rejoicing cannot be reduced to suppressing sorrow.'],
          ['John 11:33–35'],
        ),
        optionalStudy(
          'b3-corinthians',
          'Explore sorrow and rejoicing together — 2 Corinthians 6:10',
          ['Paul describes his ministry as “sorrowful, yet always rejoicing” (2 Corinthians 6:10). Sorrow and rejoicing are not treated as mutually exclusive experiences.'],
          ['2 Corinthians 6:10'],
        ),
      ],
    },
    {
      _key: 'b4',
      _type: 'challengeScreen',
      screenLabel: 'Gospel',
      heading: 'We have to remember the Gospel',
      blocks: [
        {
          _key: 'b4-cards',
          _type: 'visualCardsBlock',
          cards: [
            {_key: 'b4-card-brokenness', _type: 'visualCard', title: 'A world broken by sin', body: 'We live in a world that has been broken by sin.'},
            {_key: 'b4-card-nonabandonment', _type: 'visualCard', title: 'God has not abandoned us', body: 'But God has not abandoned us to that brokenness.'},
            {_key: 'b4-card-jesus', _type: 'visualCard', title: 'Jesus Christ', body: 'He sent His Son, Jesus Christ, to atone for the sins of humanity and reconcile us to Himself.'},
          ],
          reviewStatus: 'proposed',
        },
        richText('b4-text', ['We know that what we experience in this broken world is not the end of the story.']),
        statement('b4-statement', 'And that’s where our rejoicing comes from.'),
      ],
    },
    {
      _key: 'b5',
      _type: 'challengeScreen',
      screenLabel: 'Hope',
      heading: 'What God has done, is doing, and will do',
      blocks: [
        {
          _key: 'b5-sequence',
          _type: 'connectedSequenceBlock',
          steps: [
            {_key: 'b5-step-done', _type: 'sequenceStep', title: 'What God has done', body: 'Jesus Christ came to atone for sin and reconcile us to God.'},
            {_key: 'b5-step-doing', _type: 'sequenceStep', title: 'What God is doing', body: 'Through Jesus, God has already begun the work of redemption.'},
            {_key: 'b5-step-promised', _type: 'sequenceStep', title: 'What God has promised', body: 'One day He will make all things new. Present brokenness is not the final story.'},
          ],
          cycle: false,
          reviewStatus: 'proposed',
        },
        richText('b5-text', [
          'When we understand this, we begin to see that rejoicing isn’t dependent on whether we’re having a good day or a bad one. It’s rooted in what God has done, what He is doing, and what He has promised to do.',
          'It’s learning to keep our eyes on God and His kingdom even when the circumstances right in front of us are difficult. It’s learning to respond to this broken world with our hearts and minds fixed on the Lord, just as Jesus demonstrated throughout His earthly life.',
        ]),
        optionalStudy(
          'b5-renewal',
          'Explore the promise of renewal — Romans 8:18–25 and Revelation 21:1–5',
          ['Romans 8 describes creation\'s groaning and the hope of redemption. Revelation 21 presents the new creation and God’s promise to make all things new. Both passages enlarge the future hope Alexis identifies as the basis for Christian rejoicing.'],
          ['Romans 8:18–25', 'Revelation 21:1–5'],
        ),
      ],
    },
    {
      _key: 'b6',
      _type: 'challengeScreen',
      screenLabel: 'Practice',
      heading: 'Rejoicing in real circumstances',
      blocks: [
        richText('b6-text', ['And as we learn to rejoice in the Lord regardless of our circumstances, something else begins to happen. We become more aware of just how much we have to be thankful for.']),
        {
          _key: 'b6-reflection',
          _type: 'reflectionBlock',
          question: 'So today, I want you to practice rejoicing.',
          choices: [
            {_key: 'wonderful', _type: 'reflectionChoice', label: 'Something wonderful happens', prompt: 'Recognize God’s goodness and that He is the source of what we have.'},
            {_key: 'difficult', _type: 'reflectionChoice', label: 'Something difficult happens', prompt: 'Remember who God is and what He has done through Jesus, without denying suffering.'},
          ],
          closing: 'Remember, rejoicing isn’t pretending everything is good. It’s remembering that God is good.',
          reviewStatus: 'proposed',
        },
      ],
    },
    {
      _key: 'b7',
      _type: 'challengeScreen',
      screenLabel: 'Pray',
      heading: 'A prayer for today',
      blocks: [
        {
          _key: 'b7-prayer',
          _type: 'prayerBlock',
          paragraphs: [
            'Lord, help me choose to actively rejoice in You throughout my day. Help me develop this practice so that it becomes a natural part of how I respond to life. When things are going well, remind me to recognize Your goodness. And when life is difficult, help me keep my eyes on You and remember what You have done for me through Jesus. Continue forming my heart and mind so that I may become more like Christ. In Jesus\' name, amen.',
          ],
        },
      ],
    },
  ],
  companionLinks: [
    {
      _key: 'b-social',
      _type: 'companionLink',
      provider: 'social',
      label: 'Social follow-on',
      description: 'Make sure you’re following me on your preferred social media platform. Later today, I’ll be sharing a deeper look at the fruit of practicing rejoicing.',
      availability: 'Editorial metadata only · No link supplied',
    },
    {
      _key: 'b-patreon',
      _type: 'companionLink',
      provider: 'patreon',
      label: 'Ministry support',
      description: 'If you’d like to help fund this biblical formation ministry, consider becoming a Patreon supporter for $5 a month. Your support helps me continue providing free Scripture teaching and resources to help Christians grow in their understanding of God’s Word and live in response to it.',
      availability: 'Editorial metadata only · Not part of the Challenge',
    },
  ],
  editorialReview: {
    _type: 'editorialReview',
    sourceTitle: 'Gratitude Scripture Challenge Nov 2026.docx — November 2 devotional',
    sourceRevision: 'Pages 8–9; existing seven-screen Interactive Challenge Lab adaptation',
    adaptationReviewed: false,
    reviewNotes: 'Core devotional paragraphs and the closing prayer come from Alexis’s supplied manuscript. The B2 comparison, B4 card presentation, B5 sequence, B6 revealed prompts, and all optional-study copy still require Alexis’s review. Supplemental Walking Reel/Greek research was not imported. NIV passage text is omitted pending app quotation rights. Release time is intentionally unset pending an explicit time and timezone decision.',
  },
}
