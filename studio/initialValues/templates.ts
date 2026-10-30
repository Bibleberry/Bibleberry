import {NOV2_TEMPLATE_ID, SERIES_DOCUMENT_ID, SERIES_TEMPLATE_ID, nov2InitialValue} from './nov2'

export const initialValueTemplates = [
  {
    id: SERIES_TEMPLATE_ID,
    title: '26-Day Biblical Gratitude Challenge',
    description: 'Fixed series identity for the November 2 pilot.',
    schemaType: 'challengeSeries',
    value: {
      _type: 'challengeSeries',
      title: '26-Day Biblical Gratitude Challenge',
      slug: {_type: 'slug', current: SERIES_DOCUMENT_ID},
    },
  },
  {
    id: NOV2_TEMPLATE_ID,
    title: 'November 2 — Rejoice Always',
    description: 'Seven-screen proposed adaptation. Opens as an unpublished draft with review and release requirements intact.',
    schemaType: 'challenge',
    value: nov2InitialValue,
  },
]
