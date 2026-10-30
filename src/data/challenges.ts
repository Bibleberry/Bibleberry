export type Challenge = {
  id: string
  title: string
  orderedEntryIds: string[]
}

// Ordered content relationships live outside the Today layout.
export const challenges: Challenge[] = [
  {
    id: 'seven-days-sabbath-2026',
    title: 'Seven Days of Sabbath',
    orderedEntryIds: [
      'sabbath-2026-11-01',
      'sabbath-2026-11-02',
      'sabbath-2026-11-03',
      'sabbath-2026-11-04',
      'sabbath-2026-11-05',
      'sabbath-2026-11-06',
      'sabbath-2026-11-07',
    ],
  },
  {
    id: 'weekly-rhythm-pilot-2026',
    title: 'Weekly Rhythm Pilot',
    orderedEntryIds: [
      'weekly-pilot-2026-11-02',
      'weekly-pilot-2026-11-03',
      'weekly-pilot-2026-11-04',
      'weekly-pilot-2026-11-05',
      'weekly-pilot-2026-11-06',
      'weekly-pilot-2026-11-07',
      'weekly-pilot-2026-11-08',
    ],
  },
]
